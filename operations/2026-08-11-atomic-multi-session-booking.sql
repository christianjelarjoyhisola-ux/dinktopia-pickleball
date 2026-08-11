-- Atomic multi-court holds for the public booking flow.
--
-- Each session is first validated by the existing protected single-court
-- routine. All calls run inside this function's transaction. Their validated
-- slot rows are then consolidated under one booking/reference so payment,
-- cancellation, expiry, and management continue to use the existing booking
-- lifecycle without partial reservations.

-- A grouped reservation can contain two courts at the same start time. Keep
-- duplicate protection scoped to the court as well as the parent booking.
alter table public.booking_slots
  drop constraint if exists booking_slots_tenant_booking_start_unique;

alter table public.booking_slots
  add constraint booking_slots_tenant_booking_start_unique
  unique (tenant_id, booking_id, court_id, starts_at);

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
set row_security = 'off'
as $function$
declare
  v_tenant_id uuid;
  v_tenant_timezone text;
  v_existing public.bookings%rowtype;
  v_primary public.bookings%rowtype;
  v_session jsonb;
  v_result jsonb;
  v_session_result jsonb;
  v_sessions_result jsonb := '[]'::jsonb;
  v_booking_id uuid;
  v_primary_id uuid;
  v_session_index integer := 0;
  v_session_count integer;
  v_slot_count integer := 0;
  v_session_key text;
  v_session_token_hash text;
  v_first_start timestamptz;
  v_last_end timestamptz;
  v_subtotal numeric(12,2) := 0;
  v_court_subtotal numeric(12,2) := 0;
  v_equipment_fee numeric(12,2) := 0;
  v_service_fee numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_currency text;
  v_access_expires_at timestamptz;
  v_fingerprint text;
begin
  if p_access_token_hash is null or p_access_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Customer access token digest is invalid.' using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Group metadata must be a JSON object.' using errcode = '22023';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Booking sessions must be a JSON array.' using errcode = '22023';
  end if;

  v_session_count := jsonb_array_length(p_sessions);
  if v_session_count < 1 or v_session_count > 18 then
    raise exception 'Between 1 and 18 booking sessions are required.' using errcode = '22023';
  end if;

  v_fingerprint := nullif(p_metadata ->> 'groupFingerprint', '');
  if v_fingerprint is null or char_length(v_fingerprint) <> 64 or v_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Booking group fingerprint is invalid.' using errcode = '22023';
  end if;

  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  select t.timezone
    into v_tenant_timezone
    from public.tenants t
   where t.id = v_tenant_id
     and t.status = 'active';
  if v_tenant_id is null or v_tenant_timezone is null then
    raise exception 'Unknown tenant or hostname.' using errcode = '22023';
  end if;

  -- A lost response is retried with the same browser UUID. Return the one
  -- previously consolidated booking and never recreate deleted child rows.
  select b.*
    into v_existing
    from public.bookings b
   where b.tenant_id = v_tenant_id
     and b.idempotency_key = btrim(p_idempotency_key);

  if v_existing.id is not null then
    if coalesce(v_existing.metadata ->> 'groupFingerprint', '') <> v_fingerprint then
      raise exception 'Idempotency key was already used for a different booking group.' using errcode = '22023';
    end if;
    select token.expires_at
      into v_access_expires_at
      from public.booking_access_tokens token
     where token.tenant_id = v_existing.tenant_id
       and token.booking_id = v_existing.id;
    return jsonb_build_object(
      'bookingId', v_existing.id,
      'reference', v_existing.reference,
      'status', v_existing.status,
      'expiresAt', v_existing.expires_at,
      'accessExpiresAt', v_access_expires_at,
      'courtName', coalesce(v_existing.metadata ->> 'courtName', 'Dinktopia courts'),
      'bookingType', v_existing.booking_type,
      'startsAt', v_existing.starts_at,
      'endsAt', v_existing.ends_at,
      'subtotalAmount', v_existing.subtotal_amount,
      'courtSubtotalAmount', coalesce((v_existing.metadata ->> 'courtSubtotalAmount')::numeric, v_existing.subtotal_amount),
      'equipmentRentalFeeAmount', coalesce((v_existing.metadata ->> 'equipmentRentalFeeAmount')::numeric, 0),
      'equipmentRental', coalesce(v_existing.metadata -> 'equipmentRental', '{"extraPaddles":0,"balls":0}'::jsonb),
      'serviceFeeAmount', v_existing.service_fee_amount,
      'totalAmount', v_existing.total_amount,
      'currency', v_existing.currency,
      'fullPaymentOnly', coalesce((v_existing.metadata ->> 'fullPaymentOnly')::boolean, false),
      'sessions', coalesce(v_existing.metadata -> 'sessions', '[]'::jsonb)
    );
  end if;

  for v_session in select value from jsonb_array_elements(p_sessions)
  loop
    v_session_index := v_session_index + 1;
    if jsonb_typeof(v_session) <> 'object'
       or jsonb_typeof(v_session -> 'slots') <> 'array'
       or jsonb_typeof(v_session -> 'metadata') <> 'object' then
      raise exception 'Every booking session is invalid.' using errcode = '22023';
    end if;
    v_slot_count := v_slot_count + jsonb_array_length(v_session -> 'slots');
    if v_slot_count > 18 then
      raise exception 'A booking group cannot exceed 18 court-hours.' using errcode = '22023';
    end if;

    v_session_key := case
      when v_session_index = 1 then btrim(p_idempotency_key)
      else btrim(p_idempotency_key) || ':' || v_session_index::text
    end;
    -- The access-token digest is unique per tenant. Temporary child bookings
    -- therefore need distinct digests until their slots are consolidated and
    -- the child rows (and their cascading token rows) are deleted below.
    v_session_token_hash := case
      when v_session_index = 1 then p_access_token_hash
      else md5(p_access_token_hash || ':' || v_session_index::text)
        || md5('child:' || p_access_token_hash || ':' || v_session_index::text)
    end;

    v_result := public.create_public_booking_with_access(
      p_tenant_slug,
      p_hostname,
      (v_session ->> 'courtId')::uuid,
      p_booking_type,
      p_customer_name,
      p_customer_email,
      p_customer_phone,
      p_guest_count,
      (v_session ->> 'startsAt')::timestamptz,
      (v_session ->> 'endsAt')::timestamptz,
      v_session -> 'slots',
      (v_session ->> 'subtotalAmount')::numeric,
      (v_session ->> 'serviceFeeAmount')::numeric,
      (v_session ->> 'totalAmount')::numeric,
      v_session ->> 'currency',
      v_session -> 'metadata',
      v_session_key,
      v_session_token_hash
    );

    v_booking_id := nullif(v_result ->> 'bookingId', '')::uuid;
    if v_booking_id is null then
      raise exception 'A validated booking session returned no booking.' using errcode = '22023';
    end if;

    if v_primary_id is null then
      v_primary_id := v_booking_id;
    else
      update public.booking_slots
         set booking_id = v_primary_id
       where tenant_id = v_tenant_id
         and booking_id = v_booking_id;
      delete from public.bookings
       where tenant_id = v_tenant_id
         and id = v_booking_id;
    end if;

    v_first_start := least(
      coalesce(v_first_start, (v_result ->> 'startsAt')::timestamptz),
      (v_result ->> 'startsAt')::timestamptz
    );
    v_last_end := greatest(
      coalesce(v_last_end, (v_result ->> 'endsAt')::timestamptz),
      (v_result ->> 'endsAt')::timestamptz
    );
    v_subtotal := v_subtotal + (v_result ->> 'subtotalAmount')::numeric;
    v_court_subtotal := v_court_subtotal + (v_result ->> 'courtSubtotalAmount')::numeric;
    v_equipment_fee := v_equipment_fee + (v_result ->> 'equipmentRentalFeeAmount')::numeric;
    v_service_fee := v_service_fee + (v_result ->> 'serviceFeeAmount')::numeric;
    v_total := v_total + (v_result ->> 'totalAmount')::numeric;
    if v_currency is null then
      v_currency := v_result ->> 'currency';
    elsif v_currency <> v_result ->> 'currency' then
      raise exception 'All booking sessions must use one currency.' using errcode = '22023';
    end if;

    v_session_result := jsonb_build_object(
      'courtId', v_session ->> 'courtId',
      'courtName', v_result ->> 'courtName',
      'bookingDate', v_session ->> 'bookingDate',
      'startTime', v_session ->> 'startTime',
      'durationHours', (v_session ->> 'durationHours')::integer,
      'startsAt', v_result ->> 'startsAt',
      'endsAt', v_result ->> 'endsAt',
      'subtotalAmount', (v_result ->> 'subtotalAmount')::numeric
    );
    v_sessions_result := v_sessions_result || jsonb_build_array(v_session_result);
  end loop;

  if v_primary_id is null or v_slot_count < 1 then
    raise exception 'The booking group contained no court-hours.' using errcode = '22023';
  end if;

  update public.bookings b
     set starts_at = v_first_start,
         ends_at = v_last_end,
         local_booking_date = (v_first_start at time zone v_tenant_timezone)::date,
         subtotal_amount = v_subtotal,
         service_fee_amount = v_service_fee,
         total_amount = v_total,
         metadata = p_metadata || jsonb_build_object(
           'atomicMultiSessionBookingV1', true,
           'sessions', v_sessions_result,
           -- Access-token updates are guarded by the immutable policy
           -- evidence trigger, so retain the server-validated first-session
           -- acceptance on the consolidated parent booking.
           'policyAcceptance', p_sessions #> '{0,metadata,policyAcceptance}',
           'courtSubtotalAmount', v_court_subtotal,
           'equipmentRentalFeeAmount', v_equipment_fee,
           'fullPaymentOnly', true
         )
   where b.tenant_id = v_tenant_id
     and b.id = v_primary_id
   returning b.* into v_primary;

  update public.booking_slots slot
     set hold_expires_at = v_primary.expires_at
   where slot.tenant_id = v_tenant_id
     and slot.booking_id = v_primary.id;

  v_access_expires_at := greatest(v_last_end + interval '30 days', now() + interval '1 day');
  update public.booking_access_tokens token
     set expires_at = greatest(token.expires_at, v_access_expires_at)
   where token.tenant_id = v_tenant_id
     and token.booking_id = v_primary.id;

  return jsonb_build_object(
    'bookingId', v_primary.id,
    'reference', v_primary.reference,
    'status', v_primary.status,
    'expiresAt', v_primary.expires_at,
    'accessExpiresAt', v_access_expires_at,
    'courtName', coalesce(p_metadata ->> 'courtName', case when v_session_count = 1 then v_sessions_result #>> '{0,courtName}' else v_session_count::text || ' courts' end),
    'bookingType', v_primary.booking_type,
    'startsAt', v_primary.starts_at,
    'endsAt', v_primary.ends_at,
    'subtotalAmount', v_primary.subtotal_amount,
    'courtSubtotalAmount', v_court_subtotal,
    'equipmentRentalFeeAmount', v_equipment_fee,
    'equipmentRental', coalesce(p_metadata -> 'equipmentRental', '{"extraPaddles":0,"balls":0}'::jsonb),
    'serviceFeeAmount', v_primary.service_fee_amount,
    'totalAmount', v_primary.total_amount,
    'currency', v_primary.currency,
    'fullPaymentOnly', true,
    'sessions', v_sessions_result
  );
end;
$function$;

revoke all on function public.create_public_booking_group_with_access(
  text, text, text, text, text, text, integer, jsonb, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.create_public_booking_group_with_access(
  text, text, text, text, text, text, integer, jsonb, jsonb, text, text
) to service_role;
