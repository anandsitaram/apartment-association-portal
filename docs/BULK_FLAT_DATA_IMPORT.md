# Bulk Flat Data Import

**Flat User Management** includes a **Bulk import flat data** panel (template, export and upload) for apartment metadata. It sits above **Bulk import Flat Users**, which creates resident login accounts. The Flats page keeps single-flat editing and links here.

## Template columns

- `flat` — required flat number/identifier. Use unique IDs across blocks, such as `A-101` and `C-101`.
- `block` — optional block/building label, such as `A` or `C`; supports filtering flats by block.
- `name` — owner/resident display name.
- `type` — apartment type (for example, 2BHK or 3BHK).
- `bua` — built-up area in square feet; required for new flats.
- `uds` — undivided share; optional and defaults to 0 for new flats.
- `phone`, `email` — optional contact details.
- `excluded` — whether to exclude the flat from maintenance calculations (`TRUE`/`FALSE`).
- `corpexcluded` — whether to exclude the flat from Corpus Fund calculations (`TRUE`/`FALSE`).

SL is assigned automatically for newly created flats. The import is limited to 500 rows per upload.

## Modes

- **Create new flats only:** creates new flat records, skips existing flat numbers, and checks the configured total-flat limit. New flats become available in the Months/payment table. Does not create user accounts or payment records.
- **Update existing flats:** matches by flat number, updates non-empty fields only, and skips unknown flat numbers rather than creating them. Blank cells leave existing values unchanged. It does not change payment records or overwrite historical month values. Exclusion flags are applied to the latest month, matching the normal flat-edit workflow.

Phone and email values are encrypted before being stored. Each row returns a created, updated, skipped, or error result. The audit log stores only the import mode and result counts, not contact details.

To create login credentials, use **Bulk import Flat Users** on the same page after the flat records exist.

## Building blocks

The optional `block` column supports multiple buildings or blocks (for example `A` and `C`). Flat number remains the unique payment/account identifier, so use distinct flat identifiers such as `A-101` and `C-101`. The Flats page can be filtered by block, and export includes the block value.
