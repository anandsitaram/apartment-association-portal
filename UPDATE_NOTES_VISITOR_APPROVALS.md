# Visitor photo approvals and QR access

## Workflow

1. A resident creates a one-time six-digit visitor access code in the mobile app. The app can display the code as a QR image.
2. Security scans the QR code (or enters the six digits), verifies the visitor, and captures a photo using the device camera.
3. Security submits the photo. The request remains `pending`; the access code cannot be accepted until the flat owner approves it.
4. Flat users can review the photo in the mobile Visitor Access screen or the web Visitor Access page and approve or reject it.
5. Approval marks the request `approved` and the access code `accepted`. Rejection marks both workflows as rejected. Security can check the decision in the mobile app.

## Backend and deployment

- `server/db.ts` creates the `visitor_photo_requests` table automatically when the schema version advances to 25.
- `migrations/025_visitor_photo_approvals.sql` contains the equivalent database migration for deployments that run SQL migrations separately.
- The image is stored as a compressed JPEG/PNG data URI in the database. The mobile camera flow caps the encoded payload at 750 KB; only the five most recent requests are returned per flat to keep API responses manageable. Reviewed photos older than 90 days are removed when a new request is submitted; pending requests are retained until decided.
- Email notifications with the visitor photo attached are best-effort and require the existing `RESEND_API_KEY` and `MAIL_FROM` configuration. Residents can still review pending requests in the authenticated app if email is not configured.
- The camera and QR scanning dependencies are `react-native-image-picker`, `react-native-camera-kit`, and `react-native-qrcode-svg`. Run `npm install` in `mobile/` so the lockfile resolves these new dependencies before building.

## Permissions

- iOS camera usage text is configured in `mobile/ios/RVFallon/Info.plist`.
- Android camera permission is declared in `mobile/android/app/src/main/AndroidManifest.xml`.
- Camera use must be tested on a physical iPhone and Android device. Native compilation and live API/database testing have not been run in this environment.
