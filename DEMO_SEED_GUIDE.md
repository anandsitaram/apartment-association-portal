# Demo data seed guide

The `npm run seed:demo` command creates fictional sample records for the main Apartment Association Portal modules for the current month-to-date and the previous three calendar months.

## Safety requirements

- Use a separate, disposable demo database. Do not point `DATABASE_URL` or `POSTGRES_URL` at production.
- The seed script refuses `NODE_ENV=production` unless `ALLOW_DEMO_SEED_IN_PRODUCTION=true` is explicitly set. Do not set that override for a real deployment.
- The script expects the built-in fictional demo flat list and demo-only accounts; it aborts if it finds flat or user records outside that list.
- Do not use the demo account passwords in any deployed environment.
- Visitor photo and parcel image fields use a tiny generic placeholder image, not real resident or visitor photos.
- The seed is additive and uses demo markers to avoid most duplicate inserts on reruns. It does not create fake backup contents, failed-login records, or audit trails.

## Run

```bash
npm install
# Set DATABASE_URL to a disposable demo database first.
npm run seed:demo
```

The script covers flats and demo residents, monthly maintenance, payments, expenses, corpus ledger, tickets, hall and gym bookings, polls and votes, events, visitor access codes, visitor photo requests, parcel notices, notification logs, contact submissions, and security events.

All financial and service records are fictional and should be treated as test data only.
