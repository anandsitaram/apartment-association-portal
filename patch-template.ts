const ExcelJS = require("exceljs");

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("public/template.xlsx");
  const ws = wb.worksheets[0];
  const SRC = 13,
    NEW = 14; // M = maint diff (kept), N = new corp diff column

  // 1) Clone every row's style from column M into the new column N (matches how the app
  //    itself clones column L's style for admin-added custom columns further along).
  for (let r = 1; r <= ws.rowCount; r++) {
    const src = ws.getCell(r, SRC);
    const dst = ws.getCell(r, NEW);
    dst.style = JSON.parse(JSON.stringify(src.style));
    if (src.numFmt) dst.numFmt = src.numFmt;
  }

  // 2) Column sizing + visibility (both diff columns start visible; the app's Settings
  //    panel / column-hide list controls this from here on, same as any other column).
  ws.getColumn(NEW).width = ws.getColumn(SRC).width;
  ws.getColumn(SRC).hidden = false;
  ws.getColumn(NEW).hidden = false;

  // 3) Headers: split the single "Difference (Actual - Expected)" into two.
  ws.getCell(19, SRC).value = "Maint. Difference\n(Actual - Expected)";
  ws.getCell(19, NEW).value = "Corp Difference\n(Actual - Expected)";

  // 4) Per-row formulas: M = maint paid - maint due, N = corp paid - corp due.
  //    (export.js overwrites these with live results on every export; this just keeps
  //    the raw template file itself sane if someone opens it directly in Excel.)
  for (let r = 20; r <= 49; r++) {
    ws.getCell(r, SRC).value = {
      formula: `IF(G${r}<>"",ROUND(N(I${r})-G${r},2),"")`,
    };
    ws.getCell(r, NEW).value = {
      formula: `IF(H${r}<>"",ROUND(N(J${r})-H${r},2),"")`,
    };
  }
  ws.getCell(50, SRC).value = { formula: 'IFERROR(SUM(M20:M49),"")' };
  ws.getCell(50, NEW).value = { formula: 'IFERROR(SUM(N20:N49),"")' };

  // 5) Merged title/banner rows spanned B:M -> now span B:N so the new column sits
  //    inside the same banner instead of poking out to the right of it.
  const oldMerges = ["B2:M2", "B4:M4", "B53:M53"];
  const newMerges = ["B2:N2", "B4:N4", "B53:N53"];
  oldMerges.forEach((m) => {
    try {
      ws.unMergeCells(m);
    } catch {}
  });
  newMerges.forEach((m) => ws.mergeCells(m));

  await wb.xlsx.writeFile("public/template.xlsx");
  console.log(
    "template.xlsx updated: column N (Corp Difference) added next to M (Maint. Difference)",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
