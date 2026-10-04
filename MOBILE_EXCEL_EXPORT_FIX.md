# Mobile Excel export fix

The mobile Months and Flats screens now generate real `.xlsx` workbooks and open the native share sheet. They no longer share CSV text while labeling it as an Excel export.

- Months: exports the selected month payment register (due, paid, balance, status, payment mode/date).
- Flats: exports the flat master register.
- Exports are written to the app cache and shared as `.xlsx` attachments.
- The controls remain admin-only. Handle the generated files as confidential because they contain owner and payment details.

## Native dependency setup

The mobile app adds `xlsx`, `react-native-fs`, and `react-native-share` to `mobile/package.json`. In the `mobile` directory, run `npm install` to regenerate `package-lock.json` with those dependencies, then rebuild the native app. For iOS, run `cd ios && pod install` after dependencies are installed.

A source-only ZIP cannot verify native share-sheet behavior; test on both Android and iOS devices. The export implementation has not been built or run in this environment.
