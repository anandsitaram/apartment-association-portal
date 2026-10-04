# RV Fallon data-protection changes and deployment requirements

## Application changes in this release

- Parcel listing, parcel-photo deletion, and parcel acknowledgement are restricted server-side to the flat linked to the signed-in account. Administrator roles no longer bypass the flat filter.
- Visitor-photo request listing and review are restricted server-side to the signed-in account's linked flat. Administrator roles no longer bypass the flat filter.
- Parcel photos and visitor photos are stored using AES-256-GCM field encryption through the existing `ENC:v1:` envelope. Photo images are no longer attached to notification emails; recipients sign in to view them in the app.
- Selected personal and contact fields are encrypted using AES-256-GCM: resident and flat contact phone/email fields, visitor names/purpose/phone/review notes, security access-code visitor names/purpose/phone, parcel courier/tracking/notes, and contact-submission name/email/subject/message/error fields.
- A schema migration encrypts existing plaintext values for those selected fields and photo columns. It requires the same `ENCRYPTION_SECRET` used by the current deployment; keep the existing key stable and preserve any configured legacy key needed to decrypt older records.
- New downloaded backups and scheduled/application-managed backup rows use an AES-256-GCM encrypted envelope. New backups include parcel and visitor records only inside the encrypted payload. Restore decrypts the envelope server-side. Super Admins can still restore older plaintext backups for backward compatibility; those should be treated as sensitive and retired after migration.

## What this does not mean

This does **not** encrypt every individual relational column at the application layer. RV Fallon relies on plaintext relational values for matching, sorting, constraints, and calculations. Full-database encryption at rest must be provided and enabled by the PostgreSQL hosting provider or through an independently designed database-encryption layer. Do not claim full database-at-rest encryption until the production provider setting is verified.

## Required deployment checklist

1. Back up the database before deploying this schema migration.
2. Configure `ENCRYPTION_SECRET` as a high-entropy secret of at least 32 characters in the production environment. Do not commit it to source control or share it in support tickets. Keep it stable; changing it without a key-rotation procedure makes existing encrypted values unreadable.
3. If this installation already uses a legacy encryption secret, retain the appropriate `LEGACY_ENCRYPTION_SECRET` until all legacy ciphertext has been safely migrated and verified.
4. Verify the production PostgreSQL provider's encryption-at-rest setting and its backup/snapshot encryption setting in the provider console. These settings cannot be enabled by a source-code change alone.
5. Keep database TLS enabled, restrict database network access, restrict backup download/restore to authorized administrators, and store exported encrypted backup files in access-controlled storage.
6. Test on a staging copy first: resident sees only their own flat's visitor/parcel records; an admin with no linked flat sees none; an admin linked to a flat sees only that flat; photos/contact fields decrypt normally in authorized screens; encrypted backup download/restore succeeds.

## Migration note

Schema version is bumped to 27. Deploy with a valid `ENCRYPTION_SECRET`. Take a database snapshot first and verify backup restoration before deploying to production.


## Security hardening notes (2026-10)

- Visitor access codes are restricted to the linked resident account and its flat. Admin roles do not receive resident visitor-code lists or create/delete codes for other flats. Visitor-photo approval and gate verification reject expired codes.
- The database CLI verifies TLS certificates by default, matching the API. `DB_SSL_REJECT_UNAUTHORIZED=false` is an explicit exception and should only be used for a known private/self-signed development database.
- `LEGACY_ENCRYPTION_SECRET` is optional for fresh installs. If legacy ciphertext remains, configure the previous effective key until the data has been re-encrypted; encrypted values still fail closed when no valid key can decrypt them.
- Mobile session/settings values are stored in the platform Keychain/Android Keystore. Existing CryptoJS-encrypted AsyncStorage values are migrated on read when the legacy key is still present.
- Browser sessions now use `sessionStorage` rather than persistent `localStorage`. This reduces persistence across browser restarts but does **not** protect tokens from malicious JavaScript. A server-managed `HttpOnly; Secure; SameSite` cookie session remains the stronger future option.
- Web Excel exports display an application confirmation that the downloaded file is unencrypted and may contain confidential resident/financial data. Mobile financial-summary CSV is also plain text; users are warned in the UI to share it only with trusted recipients.
- Application-managed backup payloads are encrypted before storage/download. Encryption at rest for the live PostgreSQL database, provider snapshots, and infrastructure-level backups is controlled by the database/hosting provider and must be enabled and verified in the provider console; source code cannot prove those settings. Do not claim all database files/backups are encrypted until verified.
