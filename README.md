# K&L Pickleball Court tenant frontend

This deployment is the K&L Pickleball Court tenant of the shared multi-tenant
pickleball booking platform. It preserves the Dinktopia implementation as the
design and functional reference while resolving customer-facing identity and
tenant scope through `activeTenant`.

The original Dinktopia tenant configuration remains registered for its own
deployment. This build fixes the active tenant at `kl-pickleball-court`;
browser input cannot select or override that scope.

## Safety and launch state

K&L is active and public booking is enabled on the canonical production origin
`klpickleball.pages.dev`. Courts, schedules, rates, payment details, policies,
and readiness are loaded from the tenant-scoped shared platform rather than
duplicated in this repository. The physical venue address and public support
channel still require verified owner data before public marketing; they must
never be guessed or copied from another tenant.

The initial K&L brand direction is a warm, welcoming neighborhood club, using
the tagline “Your local court. Your next rally.” and a forest, cream, citrus, and coral
palette. The official K&L badge and social image are configured.

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

## Launch details still required

Configure these through the management system before launch:

- verified address, map/location information, and public support details;
- production tenant-isolation tests for every privileged backend endpoint;
- server-side unpaid-hold abuse controls and monitoring;
- a reviewed privacy notice and data-retention process;
- a backup owner/admin plus MFA for sensitive operations; and
- production smoke tests, alerting, and a documented rollback procedure.

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
