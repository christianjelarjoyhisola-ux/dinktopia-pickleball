# Dinktopia Pickleball tenant frontend

Dinktopia is an original, responsive presentation layer for the shared
multi-tenant pickleball booking platform. It does not contain a copied booking
engine or a separate booking database. Public and manager operations use the
existing Supabase control plane with the immutable slug `dinktopia`.

## Safety state

The approved business values are provisional. The shared tenant is provisioned
as `setup_required`, and live public booking stays disabled until the platform
owner configures an exact domain, real courts and prices, billing and remittance
details, a payment destination, contact information, and the first owner.

When the public Supabase values are absent, the UI runs in a clearly marked
private preview mode. Preview submissions are simulated in memory and never
write customer data. When those values are present, the adapter uses only:

- the fixed `dinktopia` tenant slug;
- the shared Supabase project URL;
- a browser-safe publishable key; and
- the public Turnstile site key.

The browser never supplies a tenant UUID. The shared backend derives the tenant
from the exact slug and registered request origin, then enforces tenant scope
with RLS and tenant-aware database constraints.

The current `/manage` route is a private onboarding and operations preview. In
live mode it can authenticate and read tenant-scoped bookings, blocks, and
activation readiness, but all owner mutations remain deliberately disabled.
The shared backend already owns the guarded court, schedule, block, booking,
payment-review, and rescheduling contracts; those must be connected and tested
from Dinktopia's final registered origin after the first owner and real venue
configuration exist. The preview does not imitate production authority.

## Local development

Requires Node.js 22.13 or newer.

```text
npm install
npm run dev
```

Copy `.env.example` to a local ignored environment file only when testing the
live adapter. Never put service-role credentials, database passwords, payment
secrets, or court-owner passwords in this repository.

## Verification

```text
npm run lint
npm run build
npm test
```

The frontend contract tests verify the tenant registry boundary, browser-safe
configuration, rendered customer and manager routes, accessibility landmarks,
and removal of the starter preview. The shared backend repository owns the
database/RLS/concurrency tests.

## Architecture map

- `app/tenants/dinktopia/` — provisional Dinktopia-owned configuration.
- `app/tenants/registry.ts` — the single tenant registry boundary.
- `app/lib/platform/` — shared Supabase/Edge Function adapter and public types.
- `app/booking-experience.tsx` — customer booking composition.
- `app/manage/` — tenant-scoped owner workspace.
- `operations/` — impact inventory and guarded production onboarding notes.
- `public/og.png` — original Dinktopia social artwork generated for this site.

Shared booking, availability, payment, email, cancellation, rescheduling,
management, audit, RLS, and overlap protection remain in:

`D:\pickleball-booking-platform-backend-email-fix`
