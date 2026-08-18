-- Additive, tenant-scoped public availability metadata for coarse slot labels.
-- This intentionally returns no booking id/reference/token, customer fields,
-- payment reference, receipt path, or other evidence. The public already knows
-- these court-hours are unavailable; this only distinguishes their lifecycle.

create or replace function public.get_public_slot_lifecycle(
  p_tenant_slug text,
  p_hostname text,
  p_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  v_tenant_id uuid;
  v_timezone text;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);

  select tenant.timezone
    into v_timezone
    from public.tenants tenant
   where tenant.id = v_tenant_id
     and tenant.status = 'active';

  if v_tenant_id is null or v_timezone is null then
    raise exception 'Unknown tenant or hostname.' using errcode = '22023';
  end if;

  v_day_start := p_date::timestamp at time zone v_timezone;
  v_day_end := (p_date + 1)::timestamp at time zone v_timezone;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'courtId', slot.court_id,
        'startsAt', slot.starts_at,
        'endsAt', slot.ends_at,
        'state', case
          when booking.status = 'pending_payment' then 'held'
          when booking.status = 'payment_review' then 'payment_review'
          else 'confirmed'
        end
      )
      order by slot.starts_at, slot.court_id
    )
      from public.booking_slots slot
      join public.bookings booking
        on booking.tenant_id = slot.tenant_id
       and booking.id = slot.booking_id
     where slot.tenant_id = v_tenant_id
       and slot.starts_at < v_day_end
       and slot.ends_at > v_day_start
       and (
         (booking.status = 'pending_payment'
          and booking.expires_at > now()
          and slot.hold_expires_at > now())
         or booking.status = 'payment_review'
         or booking.status in ('confirmed', 'completed')
       )
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_public_slot_lifecycle(text, text, date) from public;
grant execute on function public.get_public_slot_lifecycle(text, text, date) to anon, authenticated;

comment on function public.get_public_slot_lifecycle(text, text, date) is
  'Returns tenant-scoped, non-identifying held/reviewing/booked labels for unavailable public court slots.';
