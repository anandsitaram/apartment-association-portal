# My Apartment green rebrand

- Replaced the fixed product identity with **My Apartment** / **MA** across web and mobile UI.
- Switched primary UI accents to green (`#2E7D32`) with pale green surfaces and borders.
- Replaced the web/mobile login building image with the repository's alternate apartment image.
- Added a My Apartment logo and generated green building app icons for PWA, Android, and iOS.
- Updated Android and iOS display names, PWA manifest, browser title, share text, visitor/parcel emails, and backup filename fallbacks.
- Added schema version 28 so existing databases update the old built-in organization defaults to `My Apartment` / `MA`, while preserving custom organization names.
- Kept the existing API URL, native package/bundle identifiers, secure-storage service names, and backup-format identifiers unchanged for compatibility.

Build and device testing remain required before deployment.
