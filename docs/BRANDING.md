# White-label branding guide

This repository is a reusable community/apartment association portal. The included **Cedar Grove Residences** identity, colors, images, and sample resident records are fictional demo content.

## Rebrand the application

1. Update `shared/branding.ts` (`APP_BRAND_NAME` and `APP_BRAND_SHORT`). Keep these values static so login and the app shell work before database bootstrap.
2. Replace `public/cedar-grove-logo.svg` with your own logo (or update `src/components/Login.tsx` to point to your asset).
3. Replace `public/community-building.svg` with a licensed building image or your own artwork. The current image is an original placeholder illustration.
4. Adjust the brand palette in `src/style.css` (`--brand-primary`, `--brand-primary-dark`, `--brand-primary-soft`, and `--brand-primary-line`) and the remaining matching accent values.
5. Update `index.html`, `public/manifest.webmanifest`, and `public/icon-192.png` / `public/icon-512.png`.
6. Update default organization metadata if desired; do not use Settings as the only source for the pre-login brand.

## Demo data and safety

`server/flats-seed.ts` contains fictional sample flat records only. It contains no real resident records or contact details. Demo login accounts are created only when you deliberately run `npm run seed:demo` against a disposable development database. The script refuses to run when `NODE_ENV=production` unless explicitly overridden, and it never overwrites existing users/flats.

Demo credentials are listed in `docs/DEMO_DATA.md`. Change or remove them before any public deployment. Use a separate database and separate secrets for every real association.
