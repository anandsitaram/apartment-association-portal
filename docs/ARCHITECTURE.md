# Kadamba Lake View Apartment application architecture

## Frontend

The client is organized by feature. Page-level components live under `src/features/` and reusable presentation primitives live under `src/components/ui/`.

```text
src/
├── app entrypoint: App.tsx / main.tsx
├── features/
│   ├── dashboard/
│   ├── months/
│   ├── flats/
│   ├── bookings/
│   ├── summary/
│   └── settings/
├── components/
│   ├── ui/       # shared design-system primitives
│   └── shared feature components
├── hooks/        # reusable React hooks
├── api.ts        # HTTP boundary
├── lib.ts        # domain-independent client helpers
└── styles
```

### UI rules

- Use shared loading, error, empty and toast components instead of browser alerts.
- Keep destructive actions behind confirmation.
- Keep table header/cell alignment driven by the same column definition.
- Preserve keyboard focus visibility and minimum touch targets.
- Feature components should own feature behavior; `components/ui` should stay domain-neutral.

## Backend

The API remains a thin HTTP/authentication boundary. Domain actions are split under `server/modules/` and combined through `server/actions.ts` for backwards-compatible dispatching.

```text
server/
├── modules/
│   ├── maintenance.ts
│   ├── corpus.ts
│   ├── users.ts
│   ├── audit.ts
│   ├── system.ts
│   ├── tickets.ts
│   ├── bookings.ts
│   ├── polls.ts
│   └── notifications.ts
├── db.ts
├── auth.ts
├── validate.ts
├── calculations.ts
└── infrastructure helpers
```

## Loading and error contract

Screen reads use the `X-RV-Screen` header so unrelated datasets are not loaded for every page. Optional feature datasets are only queried when their feature is active. The client has explicit loading, error/retry and empty states and a request timeout for stuck network requests.

## Financial-year convention

Financial years are April–March. User-facing reporting uses `FY YYYY-YY`, including Excel exports. A month range must not be used as the financial-year label.

## Role and feature security

The application uses four operational roles: `user`, `admin`, `developer`, and `super`/`superadmin` (Super Admin). Developer is intentionally not an Admin-equivalent role: Developer accounts are limited to feature configuration and cannot access apartment data, financial actions, user management, passwords/tokens, or destructive resident operations.

Feature availability is separate from role permissions. Optional modules are stored in the tenant database under the `features` settings key. Environment feature flags remain the system-level master switch: a disabled system capability cannot be enabled from the tenant UI. The effective feature state controls both navigation visibility and server-side API authorization.

Super Admin can create/delete Developer accounts. Developer can update feature configuration; Super Admin can update it from Settings → Features. Feature changes are audited with actor, timestamp, and before/after values. Disabling a feature never deletes its existing data; it hides the module and rejects its feature actions until re-enabled.

## Feature flags

Feature availability has two layers:

1. Server/system capability flags in `server/flags.ts` (environment-controlled).
2. Apartment feature configuration stored in the `settings` table.

A feature can only be enabled at the apartment level when the corresponding server capability is enabled. API actions are checked server-side through `FEATURE_ACTIONS`; navigation visibility is only a convenience layer. Disabling a feature never deletes its stored data.

Current default capabilities are: Tickets, Party Hall, Gym, Polls and Events **on**; Notifications and Reminders **off** unless their environment flags/services are configured.

## Developer account lifecycle

Only Super Admin can create or delete Developer accounts. Developer accounts are exposed through the Super Admin-only **Developer Accounts** menu and are not created from the normal Users form. Developer feature changes are audited.
