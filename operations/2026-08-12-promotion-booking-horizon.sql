-- Return every active Dinktopia promotion that can still affect a future
-- booking date. The client filters the chosen date and the hold RPC remains
-- authoritative for pricing. This preserves tenant-origin isolation.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

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
      and promotion.valid_until >= current_date
      and (promotion.max_redemptions is null or promotion.redemption_count < promotion.max_redemptions)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_active_promotions(text, text) from public, authenticated;
grant execute on function public.get_public_active_promotions(text, text) to anon, service_role;

comment on function public.get_public_active_promotions(text, text) is
  'Returns tenant-origin-scoped active promotions that may affect current or future booking dates.';

commit;
