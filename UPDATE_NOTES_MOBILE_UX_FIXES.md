# RV Fallon mobile fixes

## Updated in this package
- Removed the visible Server Settings control from the login screen.
- Added the RV purple application mark to the login screen.
- Removed the configured server URL from the About section.
- Added explicit Android camera permission requests for QR scanning and photo capture; updated the iOS camera permission description for visitor and parcel photos.
- Added mobile maintenance calculation editing, recalculation, and Super Admin reset-to-expected workflow consistent with the web app's billing options.
- Removed Bulk Payment Entry (JSON) from the mobile Months screen.
- Stacked Month Actions buttons vertically to keep their width, spacing, and alignment consistent.
- Added Super Admin booking deletion controls to mobile party hall and gym booking lists. The web app already has Super Admin deletion controls for both booking types and the backend enforces the Super Admin role.
- Replaced the green mobile launcher artwork with the RV purple/white brand icon for Android and iOS app icon assets.

## Verification and remaining QA
- TypeScript syntax transpilation passed for the changed mobile screens.
- Camera access still requires a real-device check after rebuilding/reinstalling the app; users who previously denied camera access may need to enable it in OS Settings.
- Full dependency-backed type checking, Android/iOS native builds, runtime billing recalculation, and end-to-end booking deletion have not been run in this environment.
