# K&L Pickleball Court tenant frontend

This deployment is the K&L Pickleball Court tenant of the shared multi-tenant
pickleball booking platform. It preserves the Dinktopia implementation as the
design and functional reference while resolving customer-facing identity and
tenant scope through `activeTenant`.

The original Dinktopia tenant configuration remains registered for its own
deployment. This build fixes the active tenant at `kl-pickleball-court`;
browser input cannot select or override that scope.

## Safety and setup state

K&L is intentionally provisioned as `setup_required`, with provisional preview
mode enabled and public booking disabled. No production domain, venue address,
court inventory, operating hours, prices, payment destination, contact details,
or booking policies are invented in this repository. Missing operational data
is shown as setup-in-progress or coming-soon content and must later be entered
through the management system.

When the public Supabase values are absent, the UI runs in a clearly marked
private preview mode. Preview activity is non-authoritative and must not write
customer data. A live transport is allowed only when the tenant has a configured
production domain and the current origin exactly matches it; a missing or
mismatched origin fails closed. Public booking and live mutations remain gated
by platform readiness, authentication, authorization, and tenant checks.

The browser supplies the immutable active slug, never a tenant UUID. The shared
backend derives the tenant from that slug and the registered request origin,
then enforces tenant scope with RLS and tenant-aware database constraints.
Booking recovery, browser storage, policy versions, calendar exports, download
filenames, email context, and share content are likewise namespaced from the
active tenant configuration.

## Configuration still required

Configure these through the management system before launch:

- official logo and brand assets;
- address, map/location information, and contact details;
- court count and court information;
- operating hours, rates, and pricing periods;
- production domain and its registered origin;
- payment methods, recipient details, and instructions;
- cancellation, rescheduling, refund, and booking policies; and
- the initial authorized owner and platform readiness approvals.

The temporary text wordmark uses the existing logo container dimensions, so an
official K&L logo can replace it without redesigning the pages.

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
npx tsc --noEmit
npm test
```

`npm test` runs the production build before the Node contract tests. The tests
verify the active K&L registry boundary, preservation of Dinktopia's registered
configuration, browser-safe and origin-bound platform access, tenant-scoped
customer artifacts, setup gates, rendered customer and manager routes, and
accessibility behavior. The shared backend remains authoritative for database,
RLS, and concurrency verification.

## Architecture map

- `app/tenants/kl-pickleball-court/` — K&L identity with nullable operational setup values.
- `app/tenants/dinktopia/` — preserved Dinktopia tenant configuration.
- `app/tenants/registry.ts` — fixed deployment registry and `activeTenant` boundary.
- `app/lib/platform/` — shared Supabase/Edge Function adapter and public types.
- `app/booking-experience.tsx` — tenant-aware customer booking composition.
- `app/manage/` — tenant-scoped onboarding and owner workspace.
- `operations/` — tenant-aware backend migrations and production onboarding notes.

Shared booking, availability, payment, email, cancellation, rescheduling,
management, audit, RLS, and overlap protection remain in the shared Supabase
control plane.
