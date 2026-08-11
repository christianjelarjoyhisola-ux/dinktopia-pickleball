-- Tenant-isolated, owner-approved promotions for regular public bookings.
--
-- This migration is additive. It creates no offers and updates no existing
-- bookings. A promotion affects only a future hold after the System Owner or
-- the active tenant owner explicitly publishes it from that tenant's origin.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

create table public.tenant_promotions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  discount_type text not null,
  discount_value numeric(12,2) not null,
  weekdays smallint[] not null,
  starts_at time without time zone not null,
  ends_at time without time zone not null,
  valid_from date not null,
  valid_until date not null,
  max_redemptions integer,
  redemption_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_promotions_name_present check (char_length(btrim(name)) between 2 and 120),
  constraint tenant_promotions_status_valid check (status in ('active', 'paused', 'ended')),
  constraint tenant_promotions_discount_type_valid check (discount_type in ('percentage', 'fixed_amount')),
  constraint tenant_promotions_discount_value_valid check (
    discount_value > 0 and
    (discount_type <> 'percentage' or discount_value <= 50)
  ),
  constraint tenant_promotions_weekdays_valid check (
    cardinality(weekdays) between 1 and 7 and
    weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint tenant_promotions_time_window_valid check (starts_at <> ends_at),
  constraint tenant_promotions_date_window_valid check (
    valid_until >= valid_from and valid_until <= valid_from + 366
  ),
  constraint tenant_promotions_redemptions_valid check (
    redemption_count >= 0 and
    (max_redemptions is null or max_redemptions between 1 and 10000) and
    (max_redemptions is null or redemption_count <= max_redemptions)
  ),
  constraint tenant_promotions_tenant_id_id_unique unique (tenant_id, id)
);

create index tenant_promotions_active_lookup_idx
  on public.tenant_promotions (tenant_id, valid_from, valid_until)
  where status = 'active';

create table public.tenant_promotion_courts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  promotion_id uuid not null,
  court_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, promotion_id, court_id),
  constraint tenant_promotion_courts_promotion_fk
    foreign key (tenant_id, promotion_id)
    references public.tenant_promotions(tenant_id, id) on delete cascade,
  constraint tenant_promotion_courts_court_fk
    foreign key (tenant_id, court_id)
    references public.courts(tenant_id, id) on delete cascade
);

create table public.tenant_promotion_redemptions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  promotion_id uuid not null,
  booking_id uuid not null,
  base_amount numeric(12,2) not null,
  discount_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint tenant_promotion_redemptions_promotion_fk
    foreign key (tenant_id, promotion_id)
    references public.tenant_promotions(tenant_id, id) on delete restrict,
  constraint tenant_promotion_redemptions_booking_fk
    foreign key (tenant_id, booking_id)
    references public.bookings(tenant_id, id) on delete restrict,
  constraint tenant_promotion_redemptions_amounts_valid check (
    base_amount > 0 and discount_amount > 0 and discount_amount <= base_amount
  ),
  constraint tenant_promotion_redemptions_booking_unique
    unique (tenant_id, booking_id, promotion_id),
  constraint tenant_promotion_redemptions_tenant_id_id_unique unique (tenant_id, id)
);

create trigger tenant_promotions_touch_updated_at
before update on public.tenant_promotions
for each row execute function public.touch_updated_at();

alter table public.tenant_promotions enable row level security;
alter table public.tenant_promotion_courts enable row level security;
alter table public.tenant_promotion_redemptions enable row level security;

revoke all on public.tenant_promotions from public, anon, authenticated;
revoke all on public.tenant_promotion_courts from public, anon, authenticated;
revoke all on public.tenant_promotion_redemptions from public, anon, authenticated;
grant all on public.tenant_promotions to service_role;
grant all on public.tenant_promotion_courts to service_role;
grant all on public.tenant_promotion_redemptions to service_role;

create or replace function public.get_public_active_promotions(
  p_tenant_slug text,
  p_hostname text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  if v_tenant_id is null or not public.request_origin_matches_tenant(v_tenant_id) then
    raise exception 'PROMOTION_TENANT_ORIGIN_DENIED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', promotion.id,
      'name', promotion.name,
      'discountType', promotion.discount_type,
      'discountValue', promotion.discount_value,
      'weekdays', promotion.weekdays,
      'startsAt', to_char(promotion.starts_at, 'HH24:MI'),
      'endsAt', to_char(promotion.ends_at, 'HH24:MI'),
      'validFrom', promotion.valid_from,
      'validUntil', promotion.valid_until,
      'courtIds', (
        select jsonb_agg(scope.court_id order by scope.court_id)
        from public.tenant_promotion_courts scope
        where scope.tenant_id = v_tenant_id and scope.promotion_id = promotion.id
      )
    ) order by promotion.created_at desc)
    from public.tenant_promotions promotion
    where promotion.tenant_id = v_tenant_id
      and promotion.status = 'active'
      and current_date between promotion.valid_from and promotion.valid_until
      and (promotion.max_redemptions is null or promotion.redemption_count < promotion.max_redemptions)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_active_promotions(text, text) from public, authenticated;
grant execute on function public.get_public_active_promotions(text, text) to anon, service_role;

create or replace function public.get_manager_promotions(
  p_tenant_slug text,
  p_hostname text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_tenant_id uuid;
  v_membership_role text;
  v_can_create boolean;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'PROMOTION_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  if v_tenant_id is null or not public.request_origin_matches_tenant(v_tenant_id) then
    raise exception 'PROMOTION_TENANT_ORIGIN_DENIED' using errcode = '42501';
  end if;
  select membership.role into v_membership_role
  from public.tenant_memberships membership
  where membership.tenant_id = v_tenant_id
    and membership.user_id = auth.uid()
    and membership.status = 'active'
    and membership.role in ('owner', 'admin');
  if not public.is_platform_owner() and v_membership_role is null then
    raise exception 'PROMOTION_ACCESS_DENIED' using errcode = '42501';
  end if;
  v_can_create := public.is_platform_owner() or v_membership_role = 'owner';

  return jsonb_build_object(
    'canCreate', v_can_create,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', promotion.id,
        'name', promotion.name,
        'status', promotion.status,
        'discountType', promotion.discount_type,
        'discountValue', promotion.discount_value,
        'weekdays', promotion.weekdays,
        'startsAt', to_char(promotion.starts_at, 'HH24:MI'),
        'endsAt', to_char(promotion.ends_at, 'HH24:MI'),
        'validFrom', promotion.valid_from,
        'validUntil', promotion.valid_until,
        'courtIds', (
          select jsonb_agg(scope.court_id order by scope.court_id)
          from public.tenant_promotion_courts scope
          where scope.tenant_id = v_tenant_id and scope.promotion_id = promotion.id
        ),
        'maxRedemptions', promotion.max_redemptions,
        'redemptionCount', promotion.redemption_count
      ) order by promotion.created_at desc)
      from public.tenant_promotions promotion
      where promotion.tenant_id = v_tenant_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_manager_promotions(text, text) from public, anon;
grant execute on function public.get_manager_promotions(text, text) to authenticated, service_role;

create or replace function public.create_tenant_promotion(
  p_tenant_slug text,
  p_hostname text,
  p_name text,
  p_discount_type text,
  p_discount_value numeric,
  p_weekdays integer[],
  p_starts_at text,
  p_ends_at text,
  p_valid_from date,
  p_valid_until date,
  p_court_ids uuid[],
  p_max_redemptions integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_tenant_id uuid;
  v_membership_role text;
  v_promotion_id uuid;
  v_promotion_name text;
  v_weekdays smallint[];
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'PROMOTION_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  if v_tenant_id is null or not public.request_origin_matches_tenant(v_tenant_id) then
    raise exception 'PROMOTION_TENANT_ORIGIN_DENIED' using errcode = '42501';
  end if;
  select membership.role into v_membership_role
  from public.tenant_memberships membership
  where membership.tenant_id = v_tenant_id
    and membership.user_id = auth.uid()
    and membership.status = 'active'
    and membership.role = 'owner';
  if not public.is_platform_owner() and v_membership_role is distinct from 'owner' then
    raise exception 'PROMOTION_PUBLISH_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 2 and 120
     or p_discount_type not in ('percentage', 'fixed_amount')
     or p_discount_value is null or p_discount_value <= 0
     or (p_discount_type = 'percentage' and p_discount_value > 50)
     or p_weekdays is null or cardinality(p_weekdays) not between 1 and 7
     or exists (select 1 from unnest(p_weekdays) day where day not between 0 and 6)
     or p_starts_at !~ '^(?:[01][0-9]|2[0-3]):00$'
     or p_ends_at !~ '^(?:[01][0-9]|2[0-3]):00$'
     or p_starts_at = p_ends_at
     or p_valid_from is null or p_valid_until is null
     or p_valid_until < greatest(p_valid_from, current_date)
     or p_valid_until > p_valid_from + 366
     or p_court_ids is null or cardinality(p_court_ids) < 1
     or p_max_redemptions is not null and p_max_redemptions not between 1 and 10000 then
    raise exception 'PROMOTION_INPUT_INVALID' using errcode = '22023';
  end if;
  if (select count(distinct court.id) from public.courts court
      where court.tenant_id = v_tenant_id and court.id = any(p_court_ids))
     <> (select count(distinct requested) from unnest(p_court_ids) requested) then
    raise exception 'PROMOTION_COURT_SCOPE_INVALID' using errcode = '22023';
  end if;

  select array_agg(distinct day::smallint order by day::smallint)
  into v_weekdays from unnest(p_weekdays) day;
  perform 1 from public.tenants tenant where tenant.id = v_tenant_id for update;
  insert into public.tenant_promotions (
    tenant_id, name, status, discount_type, discount_value, weekdays,
    starts_at, ends_at, valid_from, valid_until, max_redemptions, created_by
  ) values (
    v_tenant_id, btrim(p_name), 'active', p_discount_type, round(p_discount_value, 2),
    v_weekdays, p_starts_at::time, p_ends_at::time,
    greatest(p_valid_from, current_date), p_valid_until, p_max_redemptions, auth.uid()
  ) returning * into v_promotion;

  insert into public.tenant_promotion_courts (tenant_id, promotion_id, court_id)
  select v_tenant_id, v_promotion.id, court_id
  from (select distinct unnest(p_court_ids) court_id) scope;

  insert into public.audit_events (
    tenant_id, actor_user_id, actor_role, action, entity_table, entity_id, new_data, metadata
  ) values (
    v_tenant_id, auth.uid(), case when public.is_platform_owner() then 'owner' else 'court_owner' end,
    'promotion.created', 'tenant_promotions', v_promotion.id::text,
    to_jsonb(v_promotion) - 'tenant_id' - 'created_by',
    jsonb_build_object('tenantSlug', lower(btrim(p_tenant_slug)), 'courtCount', cardinality(p_court_ids))
  );

  return jsonb_build_object(
    'id', v_promotion.id, 'name', v_promotion.name, 'status', v_promotion.status,
    'discountType', v_promotion.discount_type, 'discountValue', v_promotion.discount_value,
    'weekdays', v_promotion.weekdays, 'startsAt', to_char(v_promotion.starts_at, 'HH24:MI'),
    'endsAt', to_char(v_promotion.ends_at, 'HH24:MI'), 'validFrom', v_promotion.valid_from,
    'validUntil', v_promotion.valid_until, 'courtIds', to_jsonb(p_court_ids),
    'maxRedemptions', v_promotion.max_redemptions, 'redemptionCount', 0
  );
end;
$$;

revoke all on function public.create_tenant_promotion(
  text, text, text, text, numeric, integer[], text, text, date, date, uuid[], integer
) from public, anon;
grant execute on function public.create_tenant_promotion(
  text, text, text, text, numeric, integer[], text, text, date, date, uuid[], integer
) to authenticated, service_role;

-- Preserve the already-validated atomic hold routine and wrap it once. The
-- base function still verifies availability, configured rates, platform fees,
-- policy evidence, idempotency, and overlap protection before any discount.
do $$
begin
  if to_regprocedure('public.create_public_booking_group_with_access_base_v1(text,text,text,text,text,text,integer,jsonb,jsonb,text,text)') is null then
    alter function public.create_public_booking_group_with_access(
      text, text, text, text, text, text, integer, jsonb, jsonb, text, text
    ) rename to create_public_booking_group_with_access_base_v1;
  end if;
end;
$$;

create or replace function public.create_public_booking_group_with_access(
  p_tenant_slug text,
  p_hostname text,
  p_booking_type text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_guest_count integer,
  p_sessions jsonb,
  p_metadata jsonb,
  p_idempotency_key text,
  p_access_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result jsonb;
  v_tenant_id uuid;
  v_timezone text;
  v_booking public.bookings%rowtype;
  v_slot public.booking_slots%rowtype;
  v_promotion public.tenant_promotions%rowtype;
  v_slot_base numeric(12,2);
  v_slot_discount numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_discounted_subtotal numeric(12,2);
  v_service_fee numeric(12,2);
  v_applications jsonb := '[]'::jsonb;
  v_application record;
  v_slot_count integer;
  v_billing public.tenant_platform_billing%rowtype;
begin
  v_result := public.create_public_booking_group_with_access_base_v1(
    p_tenant_slug, p_hostname, p_booking_type, p_customer_name, p_customer_email,
    p_customer_phone, p_guest_count, p_sessions, p_metadata, p_idempotency_key,
    p_access_token_hash
  );

  -- This release is deliberately Dinktopia-only. Every other tenant returns
  -- the original protected function result byte-for-byte and performs no
  -- promotion reads, pricing changes, metadata writes, or counters.
  if lower(btrim(p_tenant_slug)) <> 'dinktopia' then
    return v_result;
  end if;

  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  if v_tenant_id is null then
    raise exception 'PROMOTION_TENANT_ORIGIN_DENIED' using errcode = '42501';
  end if;
  select tenant.timezone into strict v_timezone
  from public.tenants tenant where tenant.id = v_tenant_id;
  select * into strict v_booking from public.bookings booking
  where booking.tenant_id = v_tenant_id and booking.id = (v_result ->> 'bookingId')::uuid
  for update;

  -- Idempotent retries never gain a promotion that did not exist when the hold
  -- was first created, and never consume a promotion twice.
  if coalesce((v_booking.metadata ->> 'promotionPricingV1')::boolean, false) then
    return v_result || jsonb_build_object(
      'subtotalAmount', v_booking.subtotal_amount,
      'courtSubtotalAmount', v_booking.subtotal_amount,
      'serviceFeeAmount', v_booking.service_fee_amount,
      'totalAmount', v_booking.total_amount,
      'promotionDiscountAmount', coalesce((v_booking.metadata ->> 'promotionDiscountAmount')::numeric, 0),
      'promotionApplications', coalesce(v_booking.metadata -> 'promotionApplications', '[]'::jsonb)
    );
  end if;

  if p_booking_type = 'regular' then
    for v_slot in
      select * from public.booking_slots slot
      where slot.tenant_id = v_tenant_id and slot.booking_id = v_booking.id
      order by slot.starts_at, slot.court_id
    loop
      select public.regular_reschedule_court_subtotal(
        court.pricing_config,
        (v_slot.starts_at at time zone v_timezone)::time,
        1
      ) into strict v_slot_base
      from public.courts court
      where court.tenant_id = v_tenant_id and court.id = v_slot.court_id;

      v_promotion_id := null;
      v_promotion_name := null;
      v_slot_discount := 0;
      select promotion.id,
        promotion.name,
        round(least(v_slot_base, case promotion.discount_type
          when 'percentage' then v_slot_base * promotion.discount_value / 100
          else promotion.discount_value
        end), 2)
      into v_promotion_id, v_promotion_name, v_slot_discount
      from public.tenant_promotions promotion
      join public.tenant_promotion_courts scope
        on scope.tenant_id = promotion.tenant_id and scope.promotion_id = promotion.id
      where promotion.tenant_id = v_tenant_id
        and scope.court_id = v_slot.court_id
        and promotion.status = 'active'
        and (v_slot.starts_at at time zone v_timezone)::date between promotion.valid_from and promotion.valid_until
        and (extract(isodow from v_slot.starts_at at time zone v_timezone)::integer - 1) = any(promotion.weekdays)
        and case when promotion.ends_at > promotion.starts_at
          then (v_slot.starts_at at time zone v_timezone)::time >= promotion.starts_at
           and (v_slot.starts_at at time zone v_timezone)::time < promotion.ends_at
          else (v_slot.starts_at at time zone v_timezone)::time >= promotion.starts_at
            or (v_slot.starts_at at time zone v_timezone)::time < promotion.ends_at
        end
        and (promotion.max_redemptions is null or promotion.redemption_count < promotion.max_redemptions)
      order by 3 desc, promotion.created_at
      limit 1
      for update of promotion;

      if v_promotion_id is not null and v_slot_discount > 0 then
        v_discount := v_discount + v_slot_discount;
        v_applications := v_applications || jsonb_build_array(jsonb_build_object(
          'promotionId', v_promotion_id,
          'name', v_promotion_name,
          'courtId', v_slot.court_id,
          'startsAt', v_slot.starts_at,
          'baseAmount', v_slot_base,
          'discountAmount', v_slot_discount
        ));
      end if;
    end loop;
  end if;

  v_discounted_subtotal := greatest(round(v_booking.subtotal_amount - v_discount, 2), 0);
  select * into strict v_billing from public.tenant_platform_billing billing
  where billing.tenant_id = v_tenant_id;
  select count(*) into v_slot_count from public.booking_slots slot
  where slot.tenant_id = v_tenant_id and slot.booking_id = v_booking.id;
  v_service_fee := round(case v_billing.fee_mode
    when 'fixed_per_booking' then v_billing.fee_amount
    when 'fixed_per_hour' then v_billing.fee_amount * v_slot_count
    when 'percentage' then v_discounted_subtotal * v_billing.fee_amount / 100
  end, 2);

  update public.bookings booking set
    subtotal_amount = v_discounted_subtotal,
    service_fee_amount = v_service_fee,
    total_amount = v_discounted_subtotal + v_service_fee,
    metadata = booking.metadata || jsonb_build_object(
      'promotionPricingV1', true,
      'originalCourtSubtotalAmount', booking.subtotal_amount,
      'promotionDiscountAmount', v_discount,
      'promotionApplications', v_applications
    )
  where booking.tenant_id = v_tenant_id and booking.id = v_booking.id
  returning * into strict v_booking;

  for v_application in
    select application."promotionId" promotion_id,
      sum(application."baseAmount") base_amount,
      sum(application."discountAmount") discount_amount
    from jsonb_to_recordset(v_applications) as application(
      "promotionId" uuid, "baseAmount" numeric, "discountAmount" numeric
    ) group by application."promotionId"
  loop
    insert into public.tenant_promotion_redemptions (
      tenant_id, promotion_id, booking_id, base_amount, discount_amount
    ) values (
      v_tenant_id, v_application.promotion_id, v_booking.id,
      v_application.base_amount, v_application.discount_amount
    );
    update public.tenant_promotions promotion
    set redemption_count = promotion.redemption_count + 1
    where promotion.tenant_id = v_tenant_id and promotion.id = v_application.promotion_id;
  end loop;

  return v_result || jsonb_build_object(
    'subtotalAmount', v_booking.subtotal_amount,
    'courtSubtotalAmount', v_booking.subtotal_amount,
    'serviceFeeAmount', v_booking.service_fee_amount,
    'totalAmount', v_booking.total_amount,
    'promotionDiscountAmount', v_discount,
    'promotionApplications', v_applications
  );
end;
$$;

revoke all on function public.create_public_booking_group_with_access(
  text, text, text, text, text, text, integer, jsonb, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_public_booking_group_with_access(
  text, text, text, text, text, text, integer, jsonb, jsonb, text, text
) to service_role;

comment on table public.tenant_promotions is
  'Owner-approved, tenant-scoped discount rules. Installation creates no rows and never modifies another tenant.';
comment on function public.create_public_booking_group_with_access(
  text, text, text, text, text, text, integer, jsonb, jsonb, text, text
) is 'Preserves protected atomic hold validation, then applies at most one best active tenant promotion per future court-hour and snapshots the result immutably.';

commit;
