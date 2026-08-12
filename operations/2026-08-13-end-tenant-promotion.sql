-- Audited offer lifecycle action. Ending keeps historical redemptions and
-- booking price snapshots intact while immediately removing the offer from
-- public discovery and future hold pricing.

create or replace function public.end_tenant_promotion(
  p_tenant_slug text,
  p_hostname text,
  p_promotion_id uuid
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
  v_promotion public.tenant_promotions%rowtype;
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
    raise exception 'PROMOTION_END_ACCESS_DENIED' using errcode = '42501';
  end if;

  update public.tenant_promotions promotion
  set status = 'ended', updated_at = clock_timestamp()
  where promotion.tenant_id = v_tenant_id
    and promotion.id = p_promotion_id
    and promotion.status in ('active', 'paused')
  returning * into v_promotion;
  if v_promotion.id is null then
    raise exception 'PROMOTION_NOT_ACTIVE' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, actor_role, action, entity_table, entity_id, new_data, metadata
  ) values (
    v_tenant_id, auth.uid(), case when public.is_platform_owner() then 'owner' else 'court_owner' end,
    'promotion.ended', 'tenant_promotions', v_promotion.id::text,
    jsonb_build_object('status', 'ended'),
    jsonb_build_object('tenantSlug', lower(btrim(p_tenant_slug)), 'redemptionCount', v_promotion.redemption_count)
  );

  return jsonb_build_object(
    'id', v_promotion.id, 'name', v_promotion.name, 'status', v_promotion.status,
    'discountType', v_promotion.discount_type, 'discountValue', v_promotion.discount_value,
    'weekdays', v_promotion.weekdays, 'startsAt', to_char(v_promotion.starts_at, 'HH24:MI'),
    'endsAt', to_char(v_promotion.ends_at, 'HH24:MI'), 'validFrom', v_promotion.valid_from,
    'validUntil', v_promotion.valid_until,
    'courtIds', coalesce((select jsonb_agg(scope.court_id order by scope.court_id)
      from public.tenant_promotion_courts scope
      where scope.tenant_id = v_tenant_id and scope.promotion_id = v_promotion.id), '[]'::jsonb),
    'maxRedemptions', v_promotion.max_redemptions, 'redemptionCount', v_promotion.redemption_count
  );
end;
$$;

revoke all on function public.end_tenant_promotion(text, text, uuid) from public, anon;
grant execute on function public.end_tenant_promotion(text, text, uuid) to authenticated, service_role;

comment on function public.end_tenant_promotion(text, text, uuid) is
  'Tenant-origin-scoped, owner-authorized, audited terminal promotion lifecycle action.';
