# Resident financial visibility

The `allowUsersViewAllFlats` setting controls whether Flat User accounts can see flat-wise maintenance and Corpus Fund data for all flats on the **Dashboard** and **Months** pages.

- Default: `false` (residents see only their own flat's financial data).
- Control: Admin and Super Admin, under **Settings → General → Account security**.
- When enabled: residents receive all flat rows and payment amounts needed for the Dashboard and Months pages.
- Privacy: resident accounts do not receive flat-owner names, phone numbers, or email addresses. Summary/My Account remains scoped to the logged-in resident's own flat.
- Server enforcement: `server/snapshot.ts` applies the visibility rule before sending the snapshot. `server/modules/maintenance.ts` allows Admin and Super Admin to change this setting, while keeping destructive account-deletion controls restricted to Super Admin.

This is a financial visibility setting, not a role or write-permission change. Flat Users remain read-only. Admins can change the visibility option; only Super Admin can change the separate permissions controlling whether Admins may delete users or flats.
