import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistentState } from "../../usePersistentState.js";
import type {
  Flat,
  LedgerEntry,
  Month,
  Payment,
  Settings,
} from "../../../shared/types";
import { call, errText, type Save } from "../../api.js";
import { exportMonth } from "../../export.js";
import {
  corpOf,
  dueDateText,
  inr,
  isDueDatePassed,
  isMaintExcluded,
  label,
  maintOf,
  n2,
  orgName,
  splitOf,
  sum,
  total,
} from "../../lib.js";
import { notify } from "../../components/ui/ToastHost.jsx";
import { HEAD, HM, NUM, TOT, TXT, colName } from "../../columns.js";
import Expenses from "../../components/Expenses.jsx";
import Row, { type Bulk, type Draft } from "../../components/Row.jsx";
import PaymentHistory from "../../components/PaymentHistory.jsx";
import { openConfirm } from "../../components/ui/appDialog.js";
import DatePicker from "../../components/ui/DatePicker.jsx";
import { printReceipt, receiptText, whatsappLink } from "../../print-doc.js";

export default function MonthTab({
  m,
  flats,
  pays,
  admin,
  hide,
  onSave,
  onClearAll,
  onDelete,
  onCloseMonth,
  settings,
  ledger,
  token,
  isLatest = false,
  canRemind = false,
}: {
  m: Month;
  flats: Flat[];
  pays: Record<string, Payment>;
  admin: boolean;
  hide: boolean;
  onSave: Save;
  onClearAll?: (() => Promise<boolean | void>) | null;
  onDelete?: (() => unknown) | null;
  onCloseMonth?: ((remaining: number) => unknown) | null;
  settings: Settings;
  ledger?: LedgerEntry[];
  token?: string;
  isLatest?: boolean;
  canRemind?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [bulk, setBulk] = useState<Omit<Bulk, "token">>({
    maint: "",
    corp: "",
    mode: "",
    date: "",
    total: "",
    scope: "empty",
  });
  const [bulkToken, setBulkToken] = useState(0);
  const [showBulk, setShowBulk] = useState(false);
  const [historyFlat, setHistoryFlat] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [flatsNote, setFlatsNote] = useState(m.notes?.flats || "");
  const draftsRef = useRef<Record<string, Draft>>({});
  const [dirtyFlats, setDirtyFlats] = useState<Set<string>>(() => new Set());
  useEffect(
    () => setFlatsNote(m.notes?.flats || ""),
    [m.month, m.notes?.flats],
  );
  const onDraftChange = useCallback(
    (flat: string, v: Draft, dirty: boolean) => {
      draftsRef.current[flat] = v;
      setDirtyFlats((prev) => {
        if (prev.has(flat) === dirty) return prev;
        const next = new Set(prev);
        dirty ? next.add(flat) : next.delete(flat);
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    if (!dirtyFlats.size) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyFlats.size]);
  // Bulk action: message every flat that still owes money for the latest month
  const remindUnpaid = async () => {
    const ok = await openConfirm({
      title: "Remind unpaid flats?",
      message: `Send a payment reminder for ${label(m.month)} to every flat that still has a balance. Flats without an e-mail or phone number are skipped.`,
      confirmLabel: "Send reminders",
    });
    if (!ok) return;
    setReminding(true);
    try {
      const r = await call<{ sentCount: number }>(
        {
          action: "sendNotificationMessage",
          channel: "all",
          targetType: "unpaid",
          subject: `Maintenance reminder – ${label(m.month)}`,
          message: `Dear resident, your ${label(m.month)} maintenance payment is still pending. Please pay at the earliest. If you have already paid, please ignore this message. – ${orgName(settings)}`,
        },
        token,
      );
      notify(
        r.sentCount
          ? `Reminder sent to ${r.sentCount} flat${r.sentCount === 1 ? "" : "s"}`
          : "No reminders were sent (no unpaid flats, or no contact details)",
        r.sentCount ? "success" : "info",
      );
    } catch (e) {
      notify(errText(e), "error");
    } finally {
      setReminding(false);
    }
  };
  // Keyboard: Enter / ↓ moves to the same box in the next row, ↑ to the previous row
  const moveWithKeys = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    const t = e.target as HTMLElement;
    if (
      !["ArrowDown", "ArrowUp", "Enter"].includes(e.key) ||
      !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement) ||
      (t instanceof HTMLInputElement && t.type === "date") ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey
    )
      return;
    const td = t.closest("td");
    const tr = td?.parentElement;
    if (!td || !tr) return;
    const cell = Array.from(tr.children).indexOf(td);
    const inCell = Array.from(td.querySelectorAll("input, select")).indexOf(t);
    const next = (
      e.key === "ArrowUp" ? tr.previousElementSibling : tr.nextElementSibling
    ) as HTMLElement | null;
    const target =
      next?.children[cell]?.querySelectorAll<HTMLElement>("input, select")[
        Math.max(inCell, 0)
      ];
    if (!target) return;
    e.preventDefault();
    target.focus();
    if (target instanceof HTMLInputElement) target.select();
  };
  const saveAll = async () => {
    const entries = [...dirtyFlats].map((flat) => {
      const v: Partial<Draft> = draftsRef.current[flat] || {};
      return {
        flat,
        maint: Number(v.maint) || 0,
        corp: Number(v.corp) || 0,
        mode: v.mode || "",
        date: v.date || "",
        extra: v.extra || {},
      };
    });
    if (!entries.length) return;
    setSaving(true);
    await onSave({ action: "savePayments", month: m.month, entries });
    setSaving(false);
  };
  const clearMonthAmounts = async () => {
    if (!onClearAll) return;
    const ok = await onClearAll();
    // The clear operation is for the selected month only. Once the server has
    // cleared that month's amounts, discard any unsaved row drafts as well so
    // Save All cannot accidentally write the old values back. The user can now
    // enter fresh amounts and use Save All normally.
    if (ok) {
      draftsRef.current = {};
      setDirtyFlats(new Set());
      setBulk({
        maint: "",
        corp: "",
        mode: "",
        date: "",
        total: "",
        scope: "empty",
      });
      setBulkToken((t) => t + 1);
    }
  };

  const applyBulk = () => {
    if (
      bulk.total === "" &&
      bulk.maint === "" &&
      bulk.corp === "" &&
      !bulk.mode &&
      !bulk.date
    )
      return;
    setBulkToken((t) => t + 1);
  };
  type Status = "paid" | "part" | "unpaid" | "excluded";
  const [statusFilter, setStatusFilter] = usePersistentState<"all" | Status>(
    "rv_months_status_filter",
    "all",
  );
  const custom = settings.custom || [],
    hidden = settings.hidden || [];
  // resident names are admin-only (the server does not even send them to anyone else)
  const showName = admin && !hidden.includes("name");
  const baseCols = [...Object.keys(HEAD), ...custom.map((c) => c.id)].filter(
    (k) => k === "flat" || (k === "name" ? showName : !hidden.includes(k)),
  );
  // the user can freeze any column: it moves to the front and stays put while scrolling sideways
  const [pinnedCol, setPinnedCol] = usePersistentState<string>(
    "rv_months_pinned_col",
    "",
  );
  const pin = baseCols.includes(pinnedCol) ? pinnedCol : "";
  const cols = pin ? [pin, ...baseCols.filter((k) => k !== pin)] : baseCols;
  const colLabel = (k: string) =>
    custom.find((c) => c.id === k)?.name || colName(k, settings, m);
  const [query, setQuery] = useState("");
  const M = (f: Flat) => maintOf(m, f),
    C = (f: Flat) => corpOf(f, m),
    P = (f: Flat): Partial<Payment> => pays[f.flat] || {};
  // Same rule Row uses for its status dot, so the filter matches what's shown on screen.
  const statusOf = (f: Flat): Status => {
    if (isMaintExcluded(m, f)) return "excluded";
    const due = M(f) + C(f),
      p = P(f),
      paid = (p.maint || 0) + (p.corp || 0);
    if (due > 0 && paid - due > -0.005) return "paid";
    return paid > 0 ? "part" : "unpaid";
  };
  const q = query.trim().toLowerCase();
  const visibleFlats = flats.filter(
    (f) =>
      (statusFilter === "all" || statusOf(f) === statusFilter) &&
      (!q ||
        f.flat.toLowerCase().includes(q) ||
        (showName && (f.name || "").toLowerCase().includes(q))),
  );
  const due = sum(flats, M),
    cd = sum(flats, C),
    mpd = sum(flats, (f) => P(f).maint),
    cpd = sum(flats, (f) => P(f).corp);
  const remaining = Math.round((mpd - total(m)) * 100) / 100;
  const transferred = (ledger || []).find(
    (e) => e.month === m.month && e.source === "month_end",
  );
  const tot: Record<string, string> = {
    name: "TOTAL",
    flat: showName ? "" : "TOTAL",
    bua: n2(sum(flats, (f) => f.bua)),
    uds: n2(sum(flats, (f) => f.uds)),
    maint: n2(due),
    corp: n2(cd),
    texp: n2(due + cd),
    mpaid: n2(mpd),
    cpaid: n2(cpd),
    tpaid: n2(mpd + cpd),
    mdiff: n2(mpd - due),
    cdiff: n2(cpd - cd),
  };
  return (
    <>
      {historyFlat && (
        <PaymentHistory
          token={token}
          month={m.month}
          flat={historyFlat}
          onClose={() => setHistoryFlat(null)}
        />
      )}
      <div className="row titlebar">
        <h2>
          {orgName(settings).toUpperCase()} – MAINTENANCE PAYMENT TRACKER –{" "}
          {label(m.month).toUpperCase()}
        </h2>
        <span className="acts">
          {admin && (
            <button
              className="pri"
              onClick={() =>
                exportMonth({
                  flats,
                  m,
                  pays,
                  hide,
                  settings: admin
                    ? settings
                    : { ...settings, hidden: [...hidden, "name"] },
                  sheet: label(m.month),
                  corpOf,
                  maintOf,
                }).catch((e) => notify("Export failed: " + errText(e), "error"))
              }
            >
              ⬇ Export to Excel
            </button>
          )}
          {admin && (
            <button onClick={() => setShowBulk(!showBulk)}>🧮 Bulk fill</button>
          )}
          {admin && canRemind && isLatest && (
            <button disabled={reminding} onClick={remindUnpaid}>
              🔔 {reminding ? "Sending…" : "Remind unpaid"}
            </button>
          )}
          {admin && (
            <button
              className="pri"
              disabled={!dirtyFlats.size || saving}
              onClick={saveAll}
            >
              💾 {saving ? "Saving…" : "Save All"}
              {dirtyFlats.size ? ` (${dirtyFlats.size})` : ""}
            </button>
          )}
          {onCloseMonth && (
            <button
              className="pri"
              disabled={remaining <= 0}
              title={
                remaining <= 0
                  ? "Nothing left over this month (maintenance collected does not exceed expenses)"
                  : transferred
                    ? `Already transferred ${inr(transferred.amount)} — click to update`
                    : "Move this month's leftover maintenance into the Corpus Fund ledger"
              }
              onClick={() => onCloseMonth(remaining)}
            >
              🏦 {transferred ? "Update transfer" : "Transfer"}{" "}
              {inr(Math.max(remaining, 0))} to Corpus Fund
            </button>
          )}
          {onClearAll && (
            <button className="danger" onClick={clearMonthAmounts}>
              🧹 Clear all amounts
            </button>
          )}
          {onDelete && (
            <button className="danger" onClick={onDelete}>
              🗑 Delete month
            </button>
          )}
        </span>
      </div>
      {isDueDatePassed(m.month, settings.dueDay) && (
        <div className="due-date-notice" role="status">
          Payment due date ({dueDateText(m.month, settings.dueDay)}) has passed.
          Unpaid and partly paid flats are highlighted below.
        </div>
      )}
      {showBulk && admin && (
        <div className="card">
          <b>Bulk fill payments</b>
          <span className="muted">
            Fill the boxes below for every flat at once — handy for flats still
            left blank. "Total paid" is split per flat into maintenance and Corp
            Fund by that flat's own dues (rule in Settings); Maint. / Corp paid,
            if filled, override their part. Nothing is saved to the database
            until you click Save All.
          </span>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="opt">
              <span>Total paid</span>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                placeholder="e.g. 2500"
                value={bulk.total}
                onChange={(e) => setBulk({ ...bulk, total: e.target.value })}
              />
            </label>
            <label className="opt">
              <span>Maint. paid</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="e.g. 3400"
                value={bulk.maint}
                onChange={(e) => setBulk({ ...bulk, maint: e.target.value })}
              />
            </label>
            <label className="opt">
              <span>Corp paid</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="e.g. 600"
                value={bulk.corp}
                onChange={(e) => setBulk({ ...bulk, corp: e.target.value })}
              />
            </label>
            <label className="opt">
              <span>Mode</span>
              <select
                value={bulk.mode}
                onChange={(e) => setBulk({ ...bulk, mode: e.target.value })}
              >
                {["", "UPI", "Bank", "Cash", "Cheque"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className="opt">
              <span>Paid date</span>
              <DatePicker
                allowPast
                clearable
                label="Bulk paid date"
                value={bulk.date}
                onChange={(d) => setBulk({ ...bulk, date: d })}
              />
            </div>
            <label className="opt">
              <span>Apply to</span>
              <select
                value={bulk.scope}
                onChange={(e) =>
                  setBulk({ ...bulk, scope: e.target.value as "all" | "empty" })
                }
              >
                <option value="empty">Empty rows only</option>
                <option value="all">All flats (overwrite)</option>
              </select>
            </label>
          </div>
          <div className="row">
            <span className="muted">
              This only fills the boxes below — review each row, then click Save
              All to write them to the database.
            </span>
            <button className="pri" onClick={applyBulk}>
              Apply to flats
            </button>
          </div>
        </div>
      )}
      <Expenses m={m} admin={admin} onSave={onSave} settings={settings} />
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="opt">
          <span>Payment status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | Status)}
          >
            <option value="all">All ({flats.length})</option>
            <option value="paid">
              Fully paid ({flats.filter((f) => statusOf(f) === "paid").length})
            </option>
            <option value="part">
              Partly paid ({flats.filter((f) => statusOf(f) === "part").length})
            </option>
            <option value="unpaid">
              Unpaid ({flats.filter((f) => statusOf(f) === "unpaid").length})
            </option>
            {flats.some((f) => statusOf(f) === "excluded") && (
              <option value="excluded">
                Excluded (
                {flats.filter((f) => statusOf(f) === "excluded").length})
              </option>
            )}
          </select>
        </label>
        <label className="opt">
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder={showName ? "Flat or name" : "Flat no."}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="opt">
          <span>Freeze column</span>
          <select value={pin} onChange={(e) => setPinnedCol(e.target.value)}>
            <option value="">Default</option>
            {baseCols.map((k) => (
              <option key={k} value={k}>
                {colLabel(k)}
              </option>
            ))}
          </select>
        </label>
        {(statusFilter !== "all" || q) && (
          <span className="muted">
            Showing {visibleFlats.length} of {flats.length} flats. Totals below
            are still for all flats.
          </span>
        )}
      </div>
      <div className="month-section-note">
        <div>
          <h3>▶ Flats</h3>
          <p className="muted">
            Add a short note for this month's flat/payment section.
          </p>
        </div>
        {admin && (
          <div className="row month-note-editor">
            <textarea
              value={flatsNote}
              maxLength={500}
              placeholder="Add a note about flats, payment follow-ups, exclusions, etc."
              onChange={(e) => setFlatsNote(e.target.value)}
            />
            <button
              className="pri"
              onClick={() =>
                onSave({
                  action: "saveMonth",
                  month: m.month,
                  expenses: m.expenses || [],
                  method: m.method || "divide",
                  value: m.value ?? 0,
                  rounding: m.rounding || "none",
                  corpRate: m.corp_rate ?? 0.5,
                  corpRounding: m.corp_rounding || "nearest",
                  excludedFlats: m.excluded_flats || [],
                  excludedExpenseFlats: m.excluded_expense_flats || [],
                  excludedCorpFlats: m.excluded_corp_flats || [],
                  notes: { ...(m.notes || {}), flats: flatsNote.trim() },
                })
              }
            >
              Save note
            </button>
          </div>
        )}
        {!admin && m.notes?.flats && (
          <p className="month-note-readonly">{m.notes.flats}</p>
        )}
      </div>
      <div className="scroll month-scroll">
        <table>
          <thead>
            <tr>
              {cols.map((k) => (
                <th
                  key={k}
                  className={
                    (HM.includes(k) ? "hm " : "") +
                    (TOT.includes(k) ? "tot " : "") +
                    (TXT.includes(k) || custom.some((c) => c.id === k)
                      ? "txt "
                      : "") +
                    (NUM.includes(k) ? "r" : "")
                  }
                >
                  {colLabel(k)}
                  <button
                    type="button"
                    className={"pin-btn" + (k === pin ? " on" : "")}
                    title={
                      k === pin
                        ? "Unfreeze this column"
                        : "Freeze this column (moves it to the front)"
                    }
                    aria-label={
                      (k === pin ? "Unfreeze " : "Freeze ") + colLabel(k)
                    }
                    aria-pressed={k === pin}
                    onClick={() => setPinnedCol(k === pin ? "" : k)}
                  >
                    📌
                  </button>
                </th>
              ))}
              {admin && <th />}
            </tr>
          </thead>
          <tbody onKeyDown={moveWithKeys}>
            {visibleFlats.map((f) => (
              <Row
                key={f.flat + m.month}
                f={f}
                mp={M(f)}
                cd={C(f)}
                p={P(f)}
                admin={admin}
                hide={hide}
                month={m.month}
                onSave={onSave}
                cols={cols}
                custom={custom}
                onDraftChange={onDraftChange}
                bulkApply={{ ...bulk, token: bulkToken }}
                excluded={isMaintExcluded(m, f)}
                split={splitOf(settings)}
                onHistory={() => setHistoryFlat(f.flat)}
                onReceipt={() => printReceipt(settings, f, m.month, P(f))}
                onWhatsApp={() =>
                  window.open(
                    whatsappLink(
                      f.phone,
                      receiptText(settings, f.flat, m.month, P(f)),
                    ),
                    "_blank",
                    "noopener",
                  )
                }
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              {cols.map((k) => (
                <td
                  key={k}
                  className={
                    (HM.includes(k) ? "hm " : "") +
                    (TOT.includes(k) ? "tot " : "") +
                    (TXT.includes(k) || custom.some((c) => c.id === k)
                      ? "txt "
                      : "") +
                    (NUM.includes(k) ? "r" : "")
                  }
                >
                  {tot[k] ?? ""}
                </td>
              ))}
              {admin && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="legend">
        <i className="dot paid" /> Fully paid <i className="dot part" /> Partly
        paid <i className="dot unpaid" /> Unpaid{" "}
        {(statusFilter !== "all" || q) && visibleFlats.length === 0 && (
          <b>No flats match this filter.</b>
        )}
        {flats.some((f) => isMaintExcluded(m, f)) && (
          <>
            <i className="dot excluded" /> Excluded from maintenance calculation
          </>
        )}
      </p>
    </>
  );
}
