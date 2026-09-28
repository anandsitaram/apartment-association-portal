import type { Data, Flat, Payment, Settings } from "../shared/types";
import { buildSummary, inr, label, n2, orgName } from "./lib.js";
import { notify } from "./components/ui/ToastHost.jsx";

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

const STYLE = `
  *{box-sizing:border-box} body{font:14px/1.5 -apple-system,"Segoe UI",Arial,sans-serif;color:#0f172a;margin:0;padding:28px}
  .doc{max-width:720px;margin:0 auto;border:1px solid #cbd5e1;border-radius:12px;padding:28px}
  h1{margin:0;font-size:22px;color:#1e3a8a} h2{margin:2px 0 18px;font-size:15px;font-weight:600;color:#475569;letter-spacing:.5px;text-transform:uppercase}
  .meta{display:flex;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
  .meta div span{display:block;color:#64748b;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right} th:first-child,td:first-child{text-align:left}
  th{background:#eff6ff;font-size:12px;color:#1e3a8a} tfoot td{font-weight:700;border-top:2px solid #1e3a8a;background:#f8fafc}
  .total{font-size:18px;font-weight:700;color:#166534}
  .foot{margin-top:22px;color:#64748b;font-size:12px;display:flex;justify-content:space-between;gap:12px}
  .due{color:#b91c1c;font-weight:700}.ok{color:#166534}
  @media print{body{padding:0}.doc{border:0}}
`;

export function printDocument(title: string, body: string) {
  const w = window.open("", "_blank");
  if (!w) {
    notify("Allow pop-ups for this site to print or save as PDF", "error");
    return;
  }
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export const receiptNo = (month: string, flat: string) =>
  `${month.replace("-", "")}-${flat}`;

export function receiptText(
  settings: Settings,
  flat: string,
  month: string,
  p: Partial<Payment>,
) {
  const maint = Number(p.maint) || 0,
    corp = Number(p.corp) || 0;
  return (
    `${orgName(settings)} – Payment receipt\n` +
    `Receipt no: ${receiptNo(month, flat)}\nFlat: ${flat}\nMonth: ${label(month)}\n` +
    `Maintenance: ${inr(maint)}\n` +
    (corp ? `Corp Fund: ${inr(corp)}\n` : "") +
    `Total paid: ${inr(maint + corp)}\n` +
    `Mode: ${p.mode || "—"}\nDate: ${fmtDate(p.paid_date)}\nThank you!`
  );
}

export function printReceipt(
  settings: Settings,
  f: Flat,
  month: string,
  p: Partial<Payment>,
) {
  const maint = Number(p.maint) || 0,
    corp = Number(p.corp) || 0;
  printDocument(
    `Receipt ${receiptNo(month, f.flat)}`,
    `<div class="doc">
      <h1>${esc(orgName(settings))}</h1><h2>Payment receipt</h2>
      <div class="meta">
        <div><span>Receipt no.</span><b>${esc(receiptNo(month, f.flat))}</b></div>
        <div><span>Flat</span><b>${esc(f.flat)}</b></div>
        <div><span>Owner</span><b>${esc(f.name || "—")}</b></div>
        <div><span>Month</span><b>${esc(label(month))}</b></div>
      </div>
      <table>
        <thead><tr><th>Description</th><th>Amount (₹)</th></tr></thead>
        <tbody>
          <tr><td>Maintenance</td><td>${n2(maint)}</td></tr>
          ${corp ? `<tr><td>Corp Fund</td><td>${n2(corp)}</td></tr>` : ""}
        </tbody>
        <tfoot><tr><td>Total received</td><td class="total">${inr(maint + corp)}</td></tr></tfoot>
      </table>
      <div class="meta" style="margin-top:18px">
        <div><span>Payment mode</span><b>${esc(p.mode || "—")}</b></div>
        <div><span>Paid on</span><b>${esc(fmtDate(p.paid_date))}</b></div>
      </div>
      <div class="foot"><span>This is a computer-generated receipt.</span><span>${esc(settings.contactEmail || "")}</span></div>
    </div>`,
  );
}

// wa.me link: opens WhatsApp with the message ready (to the flat's number when we have one)
export function whatsappLink(phone: string | undefined, text: string) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

// Month-by-month statement for one flat
export function printFlatStatement(data: Data, flat: string) {
  const f = data.flats.find((x) => x.flat === flat);
  if (!f) return;
  const S = buildSummary(data, data.flats);
  const paidOn = new Map(
    data.payments.filter((p) => p.flat === flat).map((p) => [p.month, p]),
  );
  const at = (o: Record<string, number> | undefined) => +(o?.[flat] ?? 0) || 0;
  let td = 0,
    tp = 0;
  const rows = S.ms
    .map((v) => {
      const due = at(v.due) + at(v.cdue),
        paid = at(v.paid) + at(v.cpaid);
      td += due;
      tp += paid;
      const bal = due - paid;
      return `<tr><td>${esc(label(v.month))}</td><td>${n2(due)}</td><td>${n2(paid)}</td><td>${esc(fmtDate(paidOn.get(v.month)?.paid_date))}</td><td class="${bal > 0.005 ? "due" : "ok"}">${n2(Math.max(0, bal))}</td></tr>`;
    })
    .join("");
  const out = td - tp;
  printDocument(
    `Statement flat ${flat}`,
    `<div class="doc">
      <h1>${esc(orgName(data.settings))}</h1><h2>Statement of account</h2>
      <div class="meta">
        <div><span>Flat</span><b>${esc(flat)}</b></div>
        <div><span>Owner</span><b>${esc(f.name || "—")}</b></div>
        <div><span>Generated</span><b>${esc(fmtDate(new Date().toISOString().slice(0, 10)))}</b></div>
      </div>
      <table>
        <thead><tr><th>Month</th><th>Due (₹)</th><th>Paid (₹)</th><th>Paid on</th><th>Balance (₹)</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No months recorded yet.</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td>${n2(td)}</td><td>${n2(tp)}</td><td></td><td class="${out > 0.005 ? "due" : "ok"}">${n2(Math.max(0, out))}</td></tr></tfoot>
      </table>
      <div class="foot"><span>${out > 0.005 ? "Outstanding balance shown above." : "All dues settled."}</span><span>${esc(data.settings.contactEmail || "")}</span></div>
    </div>`,
  );
}
