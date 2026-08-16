-- Complete the customer details for a short-lived public booking hold.
--
-- The initial hold is created by the existing create-booking Edge Function
-- with the exact marker values below.  This routine is the only public path
-- that can replace those values.  It requires the opaque per-booking token,
-- an active pending-payment hold, and the registered tenant hostname.

create or replace function public.complete_public_booking_details(
  p_tenant_slug text,
  p_hostname text,
  p_booking_reference text,
  p_booking_token text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  v_tenant_id uuid;
  v_booking public.bookings%rowtype;
  v_expected_hash text;
  v_actual_hash text;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_email text := lower(btrim(coalesce(p_customer_email, '')));
  v_phone text := btrim(coalesce(p_customer_phone, ''));
begin
  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  if v_tenant_id is null then
    raise exception 'Unknown tenant or hostname.' using errcode = '22023';
  end if;

  if p_booking_token is null
     or p_booking_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Booking access denied.' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100
     or char_length(v_phone) < 7 or char_length(v_phone) > 40
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or char_length(v_email) > 254 then
    raise exception 'Player details are invalid.' using errcode = '22023';
  end if;

  select b.*
  into v_booking
  from public.bookings b
  where b.tenant_id = v_tenant_id
    and b.reference = upper(btrim(p_booking_reference))
  for update;

  if v_booking.id is null then
    raise exception 'Booking access denied.' using errcode = '42501';
  end if;

  select bat.token_hash
  into v_expected_hash
  from public.booking_access_tokens bat
  where bat.tenant_id = v_tenant_id
    and bat.booking_id = v_booking.id
    and bat.expires_at > now();

  v_actual_hash := encode(
    extensions.digest(p_booking_token, 'sha256'),
    'hex'
  );
  if v_expected_hash is null or v_expected_hash is distinct from v_actual_hash then
    raise exception 'Booking access denied.' using errcode = '42501';
  end if;

  if v_booking.status <> 'pending_payment'
     or v_booking.expires_at is null
     or v_booking.expires_at <= now()
     or not exists (
       select 1
       from public.booking_slots bs
       where bs.tenant_id = v_tenant_id
         and bs.booking_id = v_booking.id
         and bs.status = 'held'
         and bs.hold_expires_at > now()
     )
     or exists (
       select 1
       from public.booking_slots bs
       where bs.tenant_id = v_tenant_id
         and bs.booking_id = v_booking.id
         and (
           bs.status <> 'held'
           or bs.hold_expires_at is null
           or bs.hold_expires_at <= now()
         )
     ) then
    raise exception 'This court hold has expired or is no longer active.'
      using errcode = 'P0001';
  end if;

  if v_booking.customer_name <> 'Booking details pending'
     or v_booking.customer_phone <> '0000000000'
     or split_part(coalesce(v_booking.customer_email, ''), '@', 1) !~ '^booking-[0-9a-f-]+$'
     or coalesce(v_booking.customer_email, '') <>
       split_part(coalesce(v_booking.customer_email, ''), '@', 1) ||
       '@pending.' || lower(btrim(p_tenant_slug)) || '.invalid'
     or v_booking.metadata ->> 'notes' <> '__details_pending_v1__' then
    -- Idempotent retry after a successful response was lost.
    if v_booking.customer_name = v_name
       and v_booking.customer_email = v_email
       and v_booking.customer_phone = v_phone then
      return jsonb_build_object(
        'reference', v_booking.reference,
        'status', v_booking.status,
        'expiresAt', v_booking.expires_at,
        'detailsComplete', true
      );
    end if;
    raise exception 'Player details have already been completed.'
      using errcode = 'P0001';
  end if;

  update public.bookings
  set customer_name = v_name,
      customer_email = v_email,
      customer_phone = v_phone,
      metadata = (coalesce(metadata, '{}'::jsonb) - 'notes') ||
        jsonb_build_object('detailsCompletedAt', now())
  where id = v_booking.id
  returning * into v_booking;

  update public.booking_access_tokens
  set last_used_at = now()
  where tenant_id = v_tenant_id
    and booking_id = v_booking.id;

  return jsonb_build_object(
    'reference', v_booking.reference,
    'status', v_booking.status,
    'expiresAt', v_booking.expires_at,
    'detailsComplete', true
  );
end;
$function$;

revoke all on function public.complete_public_booking_details(
  text, text, text, text, text, text, text
) from public;
grant execute on function public.complete_public_booking_details(
  text, text, text, text, text, text, text
) to anon, authenticated, service_role;
