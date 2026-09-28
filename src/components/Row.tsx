import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import type {
  CustomColumn,
  Flat,
  Payment,
  SplitMode,
} from "../../shared/types";
import type { Save } from "../api.js";
import { HM, NUM, TOT, TXT } from "../columns.js";
import { allocateTotal, n2 } from "../lib.js";
import DatePicker from "./ui/DatePicker.jsx";

// What is typed into one row's boxes before it is saved
export interface Draft {
  maint: string | number;
  corp: string | number;
  mode: string;
  date: string;
  extra: Record<string, string>;
}
// A "Bulk fill" request; `token` changes with every click so each row applies it once
export interface Bulk {
  maint: string;
  corp: string;
  mode: string;
  date: string;
  total: string;
  scope: "empty" | "all";
  token?: number;
}

const cents = (x: unknown) => Math.round((Number(x) || 0) * 100) / 100;
// total shown in the "Actual Total Paid" box: maintenance paid + Corp Fund paid (blank while both are blank)
const totalText = (o: Draft) =>
  o.maint === "" && o.corp === ""
    ? ""
    : String(cents((Number(o.maint) || 0) + (Number(o.corp) || 0)));

export default function Row({
  f,
  mp,
  cd,
  p,
  admin,
  hide,
  onSave,
  month,
  cols,
  custom,
  onDraftChange,
  bulkApply,
  excluded = false,
  split = "maint_first",
  onReceipt,
  onWhatsApp,
  onHistory,
}: {
  f: Flat;
  mp: number;
  cd: number;
  p: Partial<Payment>;
  admin: boolean;
  hide: boolean;
  onSave: Save;
  month: string;
  cols: string[];
  custom: CustomColumn[];
  onDraftChange?: (flat: string, draft: Draft, dirty: boolean) => void;
  bulkApply?: Bulk;
  excluded?: boolean;
  split?: SplitMode;
  onReceipt?: () => void;
  onWhatsApp?: () => void;
  onHistory?: () => void;
}) {
  const init = (): Draft => ({
    maint: p.maint ?? "",
    corp: p.corp ?? "",
    mode: p.mode || "",
    date: p.paid_date || "",
    extra: p.extra || {},
  });
  const [v, setV] = useState<Draft>(init);
  // text being typed in the Actual Total Paid box (null = show maintenance + Corp Fund paid), so a
  // half-typed "1250." is not rewritten under the cursor
  const [tDraft, setTDraft] = useState<string | null>(null);
  useEffect(() => {
    setV(init());
    setTDraft(null);
  }, [p.maint, p.corp, p.mode, p.paid_date, JSON.stringify(p.extra)]);
  const set =
    (k: "maint" | "corp" | "mode" | "date") =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setTDraft(null);
      setV({ ...v, [k]: e.target.value });
    };
  // Typing a total splits it into maintenance paid and Corp Fund paid (rule chosen in Settings). Both boxes
  // stay editable afterwards, and the total box always reflects their sum.
  const setTotal = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTDraft(raw);
    if (raw === "") return setV({ ...v, maint: "", corp: "" });
    if (!(+raw >= 0)) return;
    const a = allocateTotal(raw, mp, cd, split);
    setV({ ...v, maint: String(a.maint), corp: String(a.corp) });
  };
  const due = mp + cd,
    paid = (p.maint || 0) + (p.corp || 0),
    mdiff = (p.maint || 0) - mp,
    cdiff = (p.corp || 0) - cd,
    diff = paid - due;
  const st = excluded
    ? "excluded"
    : due > 0 && diff > -0.005
      ? "paid"
      : paid > 0
        ? "part"
        : "unpaid";
  const dirty = JSON.stringify(v) !== JSON.stringify(init());

  // Report this row's live draft up to the parent (for "Save All"), and pick up a bulk-fill request.
  useEffect(() => {
    onDraftChange?.(f.flat, v, dirty);
  }, [v, dirty, f.flat]);
  useEffect(() => {
    if (!admin || !bulkApply?.token) return;
    setV((cur) => {
      const next = { ...cur };
      const empty = (x: unknown) => x === "" || x == null;
      // one total per flat, split by that flat's own dues with the rule chosen in Settings; the Maint. / Corp
      // boxes, when also filled, then override their part
      if (
        bulkApply.total !== "" &&
        bulkApply.total != null &&
        (bulkApply.scope === "all" || (empty(cur.maint) && empty(cur.corp)))
      ) {
        const a = allocateTotal(bulkApply.total, mp, cd, split);
        next.maint = String(a.maint);
        next.corp = String(a.corp);
      }
      if (
        bulkApply.maint !== "" &&
        (bulkApply.scope === "all" || empty(cur.maint))
      )
        next.maint = bulkApply.maint;
      if (
        bulkApply.corp !== "" &&
        (bulkApply.scope === "all" || empty(cur.corp))
      )
        next.corp = bulkApply.corp;
      if (bulkApply.mode && (bulkApply.scope === "all" || !cur.mode))
        next.mode = bulkApply.mode;
      if (bulkApply.date && (bulkApply.scope === "all" || !cur.date))
        next.date = bulkApply.date;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkApply?.token]);
  const num = (k: "maint" | "corp"): ReactNode =>
    admin ? (
      <input
        type="number"
        step="any"
        inputMode="decimal"
        className="r"
        value={v[k]}
        onChange={set(k)}
      />
    ) : v[k] === "" ? (
      ""
    ) : (
      n2(v[k])
    );
  const totalPaid = admin ? (
    <input
      type="number"
      step="any"
      min="0"
      inputMode="decimal"
      className="r"
      value={tDraft ?? totalText(v)}
      onChange={setTotal}
      onBlur={() => setTDraft(null)}
      title="Type the total received: it is split into Maint. and Corp Fund paid"
    />
  ) : totalText(v) === "" ? (
    ""
  ) : (
    n2(totalText(v))
  );
  const cell: Record<string, ReactNode> = {
    sl: f.sl,
    name: hide ? "••••" : f.name || "—",
    flat: <b>{f.flat}</b>,
    type: f.type,
    bua: n2(f.bua),
    uds: n2(f.uds),
    maint: n2(mp),
    corp: n2(cd),
    texp: <b>{n2(mp + cd)}</b>,
    mpaid: num("maint"),
    cpaid: num("corp"),
    tpaid: totalPaid,
    mode: admin ? (
      <select value={v.mode} onChange={set("mode")}>
        {["", "UPI", "Bank", "Cash", "Cheque"].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    ) : (
      v.mode
    ),
    date: admin ? (
      <DatePicker
        compact
        allowPast
        clearable
        label={`Paid date for flat ${f.flat}`}
        value={v.date}
        onChange={(d) => {
          setTDraft(null);
          setV({ ...v, date: d });
        }}
      />
    ) : (
      v.date
    ),
    mdiff: <b className={mdiff < -0.005 ? "neg" : "pos"}>{n2(mdiff)}</b>,
    cdiff: <b className={cdiff < -0.005 ? "neg" : "pos"}>{n2(cdiff)}</b>,
  };
  custom.forEach((c) => {
    cell[c.id] = admin ? (
      <input
        value={v.extra[c.id] || ""}
        onChange={(e) =>
          setV({ ...v, extra: { ...v.extra, [c.id]: e.target.value } })
        }
      />
    ) : (
      v.extra[c.id] || ""
    );
  });
  return (
    <tr
      className={st}
      title={f.excluded ? "Excluded from maintenance calculation" : undefined}
    >
      {cols.map((k) => (
        <td
          key={k}
          className={
            (HM.includes(k) ? "hm " : "") +
            (TOT.includes(k) ? "tot " : "") +
            (TXT.includes(k) || custom.some((c) => c.id === k) ? "txt " : "") +
            (NUM.includes(k) ? "r" : "")
          }
        >
          {cell[k]}
        </td>
      ))}
      {admin && (
        <td>
          <button
            className="pri"
            disabled={!dirty}
            onClick={() =>
              onSave({
                action: "savePayment",
                month,
                flat: f.flat,
                maint: +v.maint || 0,
                corp: +v.corp || 0,
                mode: v.mode,
                date: v.date,
                extra: v.extra,
              })
            }
          >
            Save
          </button>{" "}
          {onHistory && (
            <button
              type="button"
              className="row-mini"
              title="See who changed this payment and when"
              onClick={onHistory}
            >
              History
            </button>
          )}
          {onReceipt &&
            !dirty &&
            (Number(p.maint) || 0) + (Number(p.corp) || 0) > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  className="row-mini"
                  title="Print or save a receipt as PDF"
                  onClick={onReceipt}
                >
                  Receipt
                </button>{" "}
                <button
                  type="button"
                  className="row-mini"
                  title="Send the receipt on WhatsApp"
                  onClick={onWhatsApp}
                >
                  WhatsApp
                </button>
              </>
            )}
        </td>
      )}
    </tr>
  );
}
