# RV Fallon migration notes

This repository package migrates the RV Fallon web and React Native mobile application code into apartment-association-portal and rebrands the shipped app as My Apartment. Existing destination public images/branding assets and `server/flats-seed.ts` flat/user seed data were retained.

## Dummy transaction data
The demo seed script now creates clearly labeled fictional monthly payment records for August and September 2026, with paid, partial, and unpaid examples and demo references. It does not run automatically. Run `npm run seed:demo` only against a fresh, disposable development/demo database after reviewing the script. The script refuses production by default and checks for unexpected flats/users. Never run it against live association data; the sample payments affect balances and are not real financial records.

## Validation
This is a source migration package. Run `npm ci`, `npm run check`, and `npm run build` at the repository root; for mobile run `cd mobile && npm ci` and the platform build/test commands. Review `.env.example` and Vercel settings before deployment. Existing production data is not included in this ZIP.
