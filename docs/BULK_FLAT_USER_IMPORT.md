# Bulk Flat User Import

The Users page supports importing or updating up to 500 Flat User rows per workbook.

## Create new users only

1. Ensure all flat records already exist under Flats.
2. In Users, download `kadamba-lake-view-flat-user-template.xlsx`.
3. Add one account per row in the `Flat Users` sheet. Keep the header names unchanged.
4. Required columns: `username`, `password`, `flat`. Optional columns: `phone`, `email`.
5. Select **Create new users only**, upload the completed workbook, and review the confirmation and result report.
6. Existing usernames are skipped; existing accounts are never changed.

## Update existing users

1. Use the same Excel template, or a workbook with the `username` column and any profile fields you want to update.
2. Select **Update existing users** before uploading.
3. `username` identifies the existing account. Non-empty `flat`, `phone`, and `email` values update the matching Flat User profile. Blank cells leave existing values unchanged.
4. Update mode never creates accounts and never changes passwords, roles, or sessions. Existing Admin, Super Admin, and Developer accounts are skipped. Unknown usernames are skipped.
5. If a flat value is supplied, that flat must already exist.

## Safety and validation

- Imports only create or update Flat User accounts; they cannot create Admin, Super Admin, or Developer accounts.
- In create mode, passwords must be at least six characters. Use unique temporary passwords and distribute them securely.
- Flats must already exist.
- Username and flat validation is performed server-side.
- The server accepts up to 500 rows per request and records a summary in the audit log without recording passwords or contact details.
- Import is row-based rather than all-or-nothing. The result report identifies rows that were created, updated, skipped, or rejected so failed rows can be corrected and uploaded again.
