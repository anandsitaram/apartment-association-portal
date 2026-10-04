# My Apartment – native mobile app (React Native)

A native Android/iOS client for the My Apartment maintenance tracker. It follows the structure of the
Daily Expense Tracker mobile app (bare React Native 0.74, `src/app` + `components` + `services` + `styles`,
encrypted-at-rest storage, optional PIN / biometric app lock) but talks to the **existing configured API**
(`/api/app`) – no server changes are needed.

This is the repository's only native app (there is no WebView/Capacitor wrapper any more). It lives in `/mobile` and imports the same `/shared` code as the web app.

## What is in the app

| Area                     | Residents                                      | Admin / Super admin                                                       |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Dashboard                | own flat's dues for the latest month, expenses | month totals, outstanding, Corpus balance                                 |
| Months                   | –                                              | month picker, per-flat status, **record / edit payments** (`savePayment`) |
| My dues                  | last 3 / 6 months for own flat                 | –                                                                         |
| Tickets                  | raise + follow own flat's tickets              | approve / in-progress / resolve / reject (super: delete)                  |
| Party hall, Gym          | request a slot, cancel own                     | approve / reject / cancel                                                 |
| Polls                    | vote, live tally                               | close poll                                                                |
| Events, Service contacts | view, tap to call                              | view, tap to call                                                         |
| Corpus fund, Flats       | –                                              | read-only ledger / flat list                                              |
| Account                  | change password, sign out, app lock            | same                                                                      |

Pages, role rules and feature flags come from `shared/navigation.ts` / `shared/roles.ts` and the server's
`features` flags, so the mobile menu always matches what a role is allowed to open. Maintenance and Corp Fund figures use
`shared/lib.ts` (`maintOf`, `corpOf`, …) and the paid / unpaid / excluded status uses `shared/dues.ts`, so numbers and badges match the web app and Excel export.

Not in the mobile app (use the web app): Excel/PDF export, Summary, month creation/editing, expenses, flat and user
management, settings, backups, audit log, notifications, security desk, developer accounts.

## Run it

```bash
cd mobile
npm install --legacy-peer-deps
npm start            # Metro
npm run android      # or: npm run ios  (cd ios && bundle exec pod install first)
```

Set the server in `src/core/config.ts` (`DEFAULT_API_BASE_URL`), or on the login screen under **Server settings**
(HTTPS only; remembered, encrypted, on the device). Native requests send no `Origin`, so no CORS setup is needed.

## Quality gates

```bash
npm run lint && npm run typecheck && npm test
```

CI: `.github/workflows/mobile-ci.yml` (lint, typecheck, tests, Metro bundle) and
`.github/workflows/mobile-android.yml` (manual release APK, artifact `my-apartment-<version>-<run>`).

## Security notes

- Session token is stored AES-encrypted in AsyncStorage; the key lives in Android Keystore / iOS Keychain.
- App lock: 4–6 digit PIN (salted PBKDF2 hash, never stored in plain text) with optional biometrics; re-locks on background.
- `android:allowBackup="false"`, HTTPS-only server URLs, and the API's role checks remain the source of truth.
- The release build is signed with the **debug keystore** (same as the reference project). Create a real keystore before publishing to Play Store.
- If a password is changed, the server revokes the session; the app signs the user out immediately.

## Layout

```
mobile/
  index.ts  app.json  metro.config.js  babel.config.js
  android/  ios/                    native shells (package com.rvfallon.mobile)
  src/
    app/         App.tsx, AppInner.tsx (boot, session, lock, data loading, tabs)
    core/        api (binds shared/api-client to the chosen server), config, pages (which pages the app implements, tab layout), status (badge wording)
    services/    secureStorage, session, appLock
    components/  common UI (Section, Stat, Chip, Sheet, LockScreen …)
    screens/     Login, Dashboard, Months, MyMaintenance, Tickets, Bookings, Polls, Events, Corpus, Flats, ServiceContacts, More
    styles/      styles.ts
  __tests__/     core.test.ts
../shared/       business logic, formatting, roles, API client, types - one copy, also used by the web app and the API
```
