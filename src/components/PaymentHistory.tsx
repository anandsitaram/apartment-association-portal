import { useEffect, useState } from "react";
import { call, errText } from "../api.js";
import { label } from "../lib.js";

interface Entry {
  id: number;
  at: string;
  username: string;
  detail?: { changes?: Record<string, [unknown, unknown]> } | null;
}

const FIELD: Record<string, string> = {
  maint: "Maintenance",
  corp: "Corp Fund",
  mode: "Mode",
  paid_date: "Paid date",
  date: "Paid date",
};
const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "empty" : String(v);

export default function PaymentHistory({
  token,
  month,
  flat,
  onClose,
}: {
  token?: string;
  month: string;
  flat: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    call<{ entries: Entry[] }>(
      { action: "listPaymentHistory", month, flat },
      token,
    )
      .then((r) => live && setEntries(r.entries))
      .catch((e) => live && setErr(errText(e)));
    return () => {
      live = false;
    };
  }, [month, flat, token]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-history-title"
      >
        <h3 id="payment-history-title">
          Change history · Flat {flat} · {label(month)}
        </h3>
        {err && <p className="err">{err}</p>}
        {!entries && !err && <p className="muted">Loading…</p>}
        {entries && !entries.length && (
          <p className="muted">No changes recorded for this payment yet.</p>
        )}
        {entries && entries.length > 0 && (
          <ul className="history-list">
            {entries.map((e) => (
              <li key={e.id}>
                <div>
                  <b>{e.username}</b>
                  <span className="muted">
                    {" "}
                    ·{" "}
                    {new Date(e.at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {Object.entries(e.detail?.changes || {}).map(([k, v]) => (
                  <div key={k} className="history-change">
                    {FIELD[k] || k}: <s>{show(v?.[0])}</s> →{" "}
                    <b>{show(v?.[1])}</b>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
