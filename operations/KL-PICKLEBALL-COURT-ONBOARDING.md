# K&L Pickleball Court guarded onboarding

## Immutable tenant identity

- Name: `K&L Pickleball Court`
- Short name: `K&L`
- Slug: `kl-pickleball-court`
- Locale: `en-PH`
- Currency: `PHP`
- Time zone: `Asia/Manila`
- Status: `setup_required`
- Public booking: disabled
- Configured production hostname: `klpickleball.pages.dev`
- Brand direction: warm, welcoming neighborhood club
- Tagline: `Your local court. Your next rally.`

The application configuration intentionally contains no venue, courts,
schedule, rates, contacts, payment destination, or policies. The configured
production hostname is `klpickleball.pages.dev`; local preview hosts remain
development-only and are not public booking origins.

## Shared-platform steps

1. A platform owner must provision the exact immutable identity above through
   the shared control plane's existing tenant-provisioning workflow.
2. Do not create domain, court, schedule, pricing, payment, policy, contact, or
   membership rows until verified values are supplied.
3. Add the first authorized owner through the platform membership workflow;
   never commit an owner UUID, password, service-role key, or database secret.
4. Enter operational details through `/manage`. The shared database remains
   authoritative; preview configuration must not be promoted as live data.
5. Confirm `klpickleball.pages.dev` through the platform's guarded domain
   workflow. It is already the hostname in the tenant application
   configuration; do not enable live transport for a different origin.
6. Enable public booking only through the authoritative activation operation
   after every platform readiness check passes.

## Deployment note

K&L was provisioned in the shared project as tenant
`a98bf68d-79e6-4233-858d-efa55df1aa51`. Its setup status remains
`setup_required`; billing is unconfigured and no court, membership, or payment
records were created. `klpickleball.pages.dev` is the primary production
origin.

The non-primary `localhost` and `kl-pickleball-court.localhost` bindings are
development-only origin registrations. They do not replace or weaken the
primary `klpickleball.pages.dev` origin.
The ignored `.env.local` contains only the shared project URL and browser-safe
publishable key. It must never contain the service-role key.
