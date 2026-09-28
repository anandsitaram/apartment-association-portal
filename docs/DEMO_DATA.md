# Fictional demo data

This repository ships with fictional sample flat records and an opt-in demo seeding script. The script creates 40 fictional flats (20 in Block A and 20 in Block C), four demo login accounts, and one sample month of expenses/payments. Flats carry a separate `block` field and can be filtered by block on the Flats page.

## Create a local demo database

1. Create a separate, disposable PostgreSQL database. Do not point this at an existing apartment's database.
2. Configure `DATABASE_URL` and a strong `ADMIN_PASSWORD` in your shell/environment.
3. Run `npm ci`.
4. Run `npm run seed:demo`.
5. Start the app with `npm run dev` and sign in using one of the accounts below.

The seed script is idempotent for its own demo records and refuses to proceed if it detects flats or user accounts outside the demo set. It also refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED_IN_PRODUCTION=true` is set; do not use that override for a real tenant.

## Demo credentials

| Role        | Username      | Password                  | Linked flat |
| ----------- | ------------- | ------------------------- | ----------- |
| Super Admin | `super-admin` | Value of `ADMIN_PASSWORD` | —           |
| Admin       | `demo.admin`  | `DemoAdmin!2026`          | —           |
| Flat User   | `demo.alex`   | `ResidentDemo!2026`       | `A-101`     |
| Flat User   | `demo.jamie`  | `ResidentDemo!2026`       | `A-102`     |
| Flat User   | `demo.casey`  | `ResidentDemo!2026`       | `C-101`     |

All resident names, flat records, and financial values are fabricated sample data. Demo passwords are public and must be changed or the accounts removed before any public deployment. Never reuse these credentials for a real association.
