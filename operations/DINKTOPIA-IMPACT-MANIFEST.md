# Dinktopia pre-edit impact manifest

Recorded before product implementation on 2026-08-08.

## Scope and invariants

- Dinktopia is an additive tenant in the existing shared Supabase control plane.
- Its immutable tenant slug is `dinktopia`; its public name is `Dinktopia Pickleball`.
- The tenant stays `setup_required` and public booking stays disabled until real domains, courts, prices, billing, payment, remittance, contact, and owner details are confirmed.
- The browser may use only the fixed slug, the shared Supabase URL, and a publishable key. It never accepts or authorizes with a caller-provided `tenant_id`.
- Existing tenant rows, domains, settings, branding, routes, assets, and behavior must not be updated, deleted, renamed, or reseeded.

## Planned frontend additions and changes

Workspace: `D:\dinktopia-pickleballcourt`

- Replace the generated starter page, layout metadata, and global styling.
- Add an isolated Dinktopia tenant configuration module and shared-platform API adapter.
- Add the public discovery, availability, booking, payment-receipt, status, and cancellation experience.
- Add the `/manage` owner workspace using the platform's existing Supabase Auth and tenant-scoped management endpoints.
- Add Dinktopia-owned image assets, responsive/accessibility styles, environment examples, tests, and onboarding documentation.
- Preserve the starter's Sites/Vinext build and Cloudflare Worker-compatible output. D1 and R2 remain unused because Supabase is the system of record.

## Planned shared-backend additions

Repository: `D:\pickleball-booking-platform-backend-email-fix`

- Add one forward-only, idempotent onboarding migration for the `dinktopia` identity in `setup_required` state.
- Add Dinktopia-specific onboarding and bidirectional tenant-isolation pgTAP coverage.
- No existing migration, Edge Function, RPC, RLS policy, trigger, constraint, or seed file will be edited.

## Database objects affected

The onboarding migration will call the existing `public.provision_tenant(...)` function only. Through that existing function and its existing insert trigger, it may add rows scoped to Dinktopia in:

- `public.tenants`
- `public.tenant_setup_status`
- `public.tenant_platform_billing`
- `public.provisioning_requests`

It will not add domains, memberships, courts, prices, payment destinations, remittance details, customers, or bookings. Those remain explicit activation prerequisites.

Existing database objects reused without modification include:

- tenant resolution: `public.resolve_tenant_id(...)`
- onboarding: `public.provision_tenant(...)`, `public.provision_tenant_domain(...)`, `public.provision_tenant_membership(...)`
- public reads: `public.get_public_tenant_bootstrap(...)`, `public.get_public_availability(...)`
- booking/payment: `create-booking`, `booking-status`, `submit-payment-receipt`, `cancel-booking`
- management: `tenant-manager-data`, `manage-blocked-dates`, `manage_tenant_court`, `apply_shared_tenant_court_schedule`, `tenant-activation-settings`, `reschedule-booking`
- isolation and integrity: existing RLS policies, tenant-aware composite foreign keys, audit triggers, and `booking_slots_no_active_overlap`

## Rollback and activation safety

- The migration never activates public booking and never creates operational or financial data.
- If onboarding must be abandoned after application, the compensating action is a narrowly targeted, audited platform-owner operation that archives only the tenant resolved by the exact `dinktopia` slug. The tenant row and slug are retained for history; no destructive rollback is permitted.
- Production domains and owner/payment details are intentionally absent from source control and must be configured through the platform's guarded onboarding workflow.
