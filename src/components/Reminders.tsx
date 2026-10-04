import { useState } from "react";
import { usePersistentState } from "../usePersistentState.js";
import type { Data, Flat, Payment } from "../../shared/types";
import { call, errText } from "../api.js";
import { corpOf, inr, label, maintOf, orgName } from "../../shared/lib.js";
import { openConfirm } from "./ui/appDialog.js";

const DEFAULT_MSG =
  "Dear {name}, the maintenance for flat {flat} for {month} shows {amount} pending. Kindly pay at the earliest. Thank you – {org}";
interface Owing {
  f: Flat;
  due: number;
  paid: number;
  out: number;
}
const fill = (tpl: string, r: Owing, month: string, org: string) =>
  tpl
    .replaceAll("{org}", org)
    .replaceAll("{name}", r.f.name || "Owner")
    .replaceAll("{flat}", r.f.flat)
    .replaceAll("{month}", label(month))
    .replaceAll("{amount}", inr(r.out));
// WhatsApp wants digits with the country code; a bare 10-digit number is taken to be Indian (+91)
const waNumber = (p?: string) => {
  const d = String(p || "")
    .replace(/\D/g, "")
    .replace(/^0(?=\d{10}$)/, "");
  return d.length === 10 ? "91" + d : d;
};

// Who still owes money for a month, with one-tap WhatsApp / e-mail / copy. Nothing is sent without a tap.
export default function Reminders({
  token,
  data,
  features,
}: {
  token?: string;
  data: Data;
  features: Data["features"];
}) {
  const months = data.months;
  const [sel, setSel] = usePersistentState<string>(
    "rv_reminders_month",
    months.at(-1)?.month || "",
  );
  const [tpl, setTpl] = useState(DEFAULT_MSG);
  const [note, setNote] = useState("");
  const m = months.find((x) => x.month === sel);
  if (!m) return <p className="muted">Add a month first.</p>;
  const pays: Record<string, Payment> = Object.fromEntries(
    data.payments.filter((p) => p.month === sel).map((p) => [p.flat, p]),
  );
  const rows = data.flats
    .map((f) => {
      const due = maintOf(m, f) + corpOf(f, m),
        p: Partial<Payment> = pays[f.flat] || {},
        paid = (p.maint || 0) + (p.corp || 0);
      return { f, due, paid, out: due - paid };
    })
    .filter((r) => r.out > 0.005);
  const withMail = rows.filter((r) => r.f.email);
  const sendAll = async () => {
    if (
      !(await openConfirm({
        title: "Send payment reminders?",
        message: `E-mail ${withMail.length} resident(s) about their pending dues?`,
        confirmLabel: "Send reminders",
      }))
    )
      return;
    try {
      const r = await call<{ sent: number; skipped: { flat: string }[] }>(
        {
          action: "sendReminders",
          items: withMail.map((r) => ({
            flat: r.f.flat,
            subject: `Maintenance reminder – ${label(sel)}`,
            text: fill(tpl, r, sel, orgName(data.settings)),
          })),
        },
        token,
      );
      setNote(
        `Sent ${r.sent}` +
          (r.skipped.length
            ? `, skipped ${r.skipped.length} (${r.skipped.map((s) => s.flat).join(", ")})`
            : ""),
      );
    } catch (e) {
      setNote(errText(e));
    }
  };
  return (
    <>
      <div className="card">
        <label className="opt">
          <span>Month</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {months.map((x) => (
              <option key={x.month} value={x.month}>
                {label(x.month)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          Message – use {"{name}"} {"{flat}"} {"{month}"} {"{amount}"}
        </span>
        <textarea
          rows={4}
          value={tpl}
          maxLength={600}
          onChange={(e) => setTpl(e.target.value)}
        />
        {features.mail && (
          <div className="row">
            <span className="muted">
              {withMail.length} of {rows.length} have an e-mail address
            </span>
            <button
              className="pri"
              disabled={!withMail.length}
              onClick={sendAll}
            >
              ✉ Send e-mail to {withMail.length}
            </button>
          </div>
        )}
        {note && <p className="calc">{note}</p>}
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Flat</th>
              <th>Owner</th>
              <th>Pending</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const text = fill(tpl, r, sel, orgName(data.settings));
              return (
                <tr key={r.f.flat}>
                  <td>
                    <b>{r.f.flat}</b>
                  </td>
                  <td>{r.f.name || "—"}</td>
                  <td className="r">
                    <b>{inr(r.out)}</b>
                  </td>
                  <td>
                    <span className="acts">
                      {r.f.phone && (
                        <a
                          className="btn"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://wa.me/${waNumber(r.f.phone)}?text=${encodeURIComponent(text)}`}
                        >
                          WhatsApp
                        </a>
                      )}
                      {r.f.email && (
                        <a
                          className="btn"
                          href={`mailto:${r.f.email}?subject=${encodeURIComponent("Maintenance reminder – " + label(sel))}&body=${encodeURIComponent(text)}`}
                        >
                          E-mail
                        </a>
                      )}
                      <button
                        onClick={() => navigator.clipboard?.writeText(text)}
                      >
                        Copy
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={4}>Everyone has paid for {label(sel)} 🎉</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="legend">
        Pending = maintenance + Corp Fund due − paid. Phone numbers with 10
        digits are treated as Indian (+91). Add phone / e-mail on the FLATS tab.
      </p>
    </>
  );
}
