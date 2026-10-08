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
  corpChargeOf,
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
} from "../../../shared/lib.js";
import { payStatus } from "../../../shared/dues.js";
import { notify } from "../../components/ui/ToastHost.jsx";
import { HM, NUM, TOT, TXT, colName } from "../../columns.js";
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
  superAdmin,
  hide,
  onSave,
  onClearAll,
  onDelete,
  onCancelMonthTransfer,
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
  superAdmin: boolean;
  hide: boolean;
  onSave: Save;
  onClearAll?: (() => Promise<boolean | void>) | null;
  onDelete?: (() => unknown) | null;
  onCancelMonthTransfer?: (() => unknown) | null;
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
  const dirtyPartsRef = useRef<
    Record<string, { maintenance: boolean; corp: boolean }>
  >({});
  useEffect(
    () => setFlatsNote(m.notes?.flats || ""),
    [m.month, m.notes?.flats],
  );
  const onDraftChange = useCallback(
    (
      flat: string,
      v: Draft,
      dirty: boolean,
      paymentPart: "maintenance" | "corp",
    ) => {
      const previous = draftsRef.current[flat] || {
        maint: "",
        corp: "",
        mode: "",
        date: "",
        extra: {},
      };
      draftsRef.current[flat] =
        paymentPart === "maintenance"
          ? {
              ...previous,
              maint: v.maint,
              ...(m.notes?.mergeMaintenanceCorp ? { corp: v.corp } : {}),
              mode: v.mode,
              date: v.date,
              extra: v.extra,
            }
          : { ...previous, corp: v.corp };
      const parts = dirtyPartsRef.current[flat] || {
        maintenance: false,
        corp: false,
      };
      parts[paymentPart] = dirty;
      if (paymentPart === "maintenance" && m.notes?.mergeMaintenanceCorp)
        parts.corp = dirty;
      dirtyPartsRef.current[flat] = parts;
      const anyDirty = parts.maintenance || parts.corp;
      setDirtyFlats((prev) => {
        if (prev.has(flat) === anyDirty) return prev;
        const next = new Set(prev);
        anyDirty ? next.add(flat) : next.delete(flat);
        return next;
      });
    },
    [m.notes?.mergeMaintenanceCorp],
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
    // This action clears expense line amounts only. Flat payment drafts and
    // saved payment records are intentionally left untouched.
    if (!onClearAll) return;
    await onClearAll();
  };

  const clearFlatPaymentAmounts = async () => {
    const confirmed = await openConfirm({
      title: `Clear flat payment amounts for ${label(m.month)}?`,
      message:
        "This removes the saved payment entries for every flat in this month, including payment amounts, payment dates, and payment methods. Expense entries and monthly billing settings will remain unchanged.",
      confirmLabel: "Clear flat payments",
      danger: true,
    });
    if (!confirmed) return;
    const ok = await onSave({ action: "clearPayments", month: m.month });
    if (ok) {
      draftsRef.current = {};
      dirtyPartsRef.current = {};
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
  useEffect(() => {
    if (statusFilter === "part") setStatusFilter("all");
  }, [statusFilter, setStatusFilter]);
  const custom = settings.custom || [],
    hidden = settings.hidden || [];
  // resident names are admin-only (the server does not even send them to anyone else)
  const showName = admin && !hidden.includes("name");
  const identityCols = [
    "sl",
    "name",
    "flat",
    ...(settings.isBlocks === true ? ["block"] : []),
    "bua",
  ].filter(
    (k) =>
      k === "sl" ||
      k === "flat" ||
      (k === "name" ? showName : !hidden.includes(k)),
  );
  // In merged mode the combined charge and payment are stored only in the
  // Maintenance bucket. Corp Fund remains zero in the payment record and UI.
  const mergeMaintenanceCorp = m.notes?.mergeMaintenanceCorp === true;
  const maintenanceCols = [
    ...identityCols,
    "maint",
    ...(mergeMaintenanceCorp ? ["corp"] : []),
    ...(!hidden.includes("texp") ? ["texp"] : []),
    mergeMaintenanceCorp ? "tpaid" : "mpaid",
    ...(!mergeMaintenanceCorp && !hidden.includes("tpaid") ? ["tpaid"] : []),
    ...custom.map((c) => c.id).filter((k) => !hidden.includes(k)),
  ];
  const corpCols = [...identityCols, "corp", "cpaid"];
  const colLabel = (k: string) => {
    if (settings.labels?.[k]) return settings.labels[k];
    if (k === "maint")
      return mergeMaintenanceCorp ? "Maintenance Fund" : "Maintenance Charge";
    if (k === "mpaid") return "Maintenance Paid";
    if (k === "tpaid" && mergeMaintenanceCorp) return "Combined Amount Paid";
    if (k === "corp") return "Corp Fund Charge";
    if (k === "cpaid") return "Corp Fund Paid";
    return custom.find((c) => c.id === k)?.name || colName(k, settings, m);
  };
  const [query, setQuery] = useState("");
  const blockNames =
    settings.isBlocks === true
      ? Array.from(
          new Set(
            flats.map((f) => String(f.block || "").trim()).filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b))
      : [];
  const [selectedBlock, setSelectedBlock] = usePersistentState<string>(
    "rv_months_block_filter",
    "all",
  );
  useEffect(() => {
    if (selectedBlock !== "all" && !blockNames.includes(selectedBlock))
      setSelectedBlock("all");
  }, [selectedBlock, blockNames.join("|")]);
  const M = (f: Flat) => maintOf(m, f, flats, settings.isBlocks === true),
    MBase = (f: Flat) =>
      mergeMaintenanceCorp
        ? maintOf(
            {
              ...m,
              notes: { ...(m.notes || {}), mergeMaintenanceCorp: false },
            },
            f,
            flats,
            settings.isBlocks === true,
          )
        : M(f),
    C = (f: Flat) => (mergeMaintenanceCorp ? corpChargeOf(f, m) : corpOf(f, m)),
    P = (f: Flat): Partial<Payment> => pays[f.flat] || {};
  // Same rule Row uses for its status dot, so the filter matches what's shown on screen.
  const statusOf = (f: Flat): Status => {
    const p = P(f);
    return payStatus(
      mergeMaintenanceCorp ? M(f) : M(f) + C(f),
      mergeMaintenanceCorp ? p.maint || 0 : (p.maint || 0) + (p.corp || 0),
      isMaintExcluded(m, f),
    );
  };
  const q = query.trim().toLowerCase();
  const visibleFlats = flats.filter(
    (f) =>
      (selectedBlock === "all" ||
        String(f.block || "").trim() === selectedBlock) &&
      (statusFilter === "all" || statusOf(f) === statusFilter) &&
      (!q ||
        f.flat.toLowerCase().includes(q) ||
        (showName && (f.name || "").toLowerCase().includes(q))),
  );
  const due = sum(flats, M),
    maintenanceBaseDue = sum(flats, MBase),
    cd = sum(flats, C),
    mpd = sum(flats, (f) => P(f).maint),
    cpd = sum(flats, (f) => P(f).corp);
  const actualTotalPaid = mergeMaintenanceCorp ? mpd : mpd + cpd;
  const completionBalance =
    Math.round((actualTotalPaid - total(m)) * 100) / 100;
  const isCompleted = Boolean(m.notes?.completion);
  const canEdit = !m.archived && !isCompleted;
  const carryForwardEntries = Object.entries(m.notes?.carryForward || {});
  const carryForwardSourceDate = (() => {
    const [year, monthNumber] = m.month.split("-").map(Number);
    return new Date(year, monthNumber - 2, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  })();
  const carryForwardTotal = carryForwardEntries.reduce(
    (sum, [, amount]) =>
      sum + (Number(amount?.maintenance) || 0) + (Number(amount?.corp) || 0),
    0,
  );
  const transferred = (ledger || []).find(
    (e) => e.month === m.month && e.source === "month_end",
  );
  const tot: Record<string, string> = {
    name: "TOTAL",
    flat: showName ? "" : "TOTAL",
    bua: n2(sum(flats, (f) => f.bua)),
    uds: n2(sum(flats, (f) => f.uds)),
    maint: n2(mergeMaintenanceCorp ? maintenanceBaseDue : due),
    corp: n2(cd),
    texp: n2(mergeMaintenanceCorp ? due : due + cd),
    mpaid: n2(mpd),
    cpaid: n2(mergeMaintenanceCorp ? 0 : cpd),
    tpaid: n2(mergeMaintenanceCorp ? mpd : mpd + cpd),
    mdiff: n2(mpd - due),
    cdiff: n2(mergeMaintenanceCorp ? 0 : cpd - cd),
  };
  const corpFundEnabled = m.corp_applicable !== false;
  const renderPaymentTable = (
    tableCols: string[],
    paymentPart: "maintenance" | "corp",
  ) => (
    <div className="scroll month-scroll">
      <table className="month-payments-table">
        <thead>
          <tr>
            {tableCols.map((k) => (
              <th
                key={k}
                className={
                  `col-${k} ` +
                  (HM.includes(k) ? "hm " : "") +
                  (TOT.includes(k) ? "tot " : "") +
                  (TXT.includes(k) || custom.some((c) => c.id === k)
                    ? "txt "
                    : "") +
                  (NUM.includes(k) ? "r" : "")
                }
              >
                {colLabel(k)}
              </th>
            ))}
            {admin && (
              <th className="col-row-actions" aria-label="Payment actions" />
            )}
          </tr>
        </thead>
        <tbody onKeyDown={moveWithKeys}>
          {visibleFlats.map((f) => (
            <Row
              key={`${paymentPart}-${f.flat}-${m.month}`}
              f={f}
              mp={MBase(f)}
              cd={C(f)}
              combinedDue={M(f)}
              p={P(f)}
              admin={admin}
              hide={hide}
              month={m.month}
              onSave={onSave}
              cols={tableCols}
              custom={paymentPart === "maintenance" ? custom : []}
              onDraftChange={onDraftChange}
              bulkApply={{ ...bulk, token: bulkToken }}
              paymentPart={paymentPart}
              merged={mergeMaintenanceCorp && paymentPart === "maintenance"}
              excluded={paymentPart === "maintenance" && isMaintExcluded(m, f)}
              split={splitOf(settings)}
              onHistory={
                paymentPart === "maintenance"
                  ? () => setHistoryFlat(f.flat)
                  : undefined
              }
              onReceipt={
                paymentPart === "maintenance"
                  ? () => printReceipt(settings, f, m.month, P(f))
                  : undefined
              }
              onWhatsApp={
                paymentPart === "maintenance"
                  ? () =>
                      window.open(
                        whatsappLink(
                          f.phone,
                          receiptText(settings, f.flat, m.month, P(f)),
                        ),
                        "_blank",
                        "noopener",
                      )
                  : undefined
              }
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            {tableCols.map((k) => (
              <td
                key={k}
                className={
                  `col-${k} ` +
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
            {admin && <td className="col-row-actions" />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
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
            <>
              <button
                className="pri"
                onClick={() =>
                  exportMonth({
                    flats,
                    m,
                    pays,
                    hide,
                    settings,
                    sheet: label(m.month),
                    corpOf,
                    maintOf: (month, flat) =>
                      maintOf(month, flat, flats, settings.isBlocks === true),
                  }).catch((e) =>
                    notify("Export failed: " + errText(e), "error"),
                  )
                }
              >
                ⬇ Export to Excel
              </button>
            </>
          )}
          {admin && canEdit && (
            <button onClick={() => setShowBulk(!showBulk)}>🧮 Bulk fill</button>
          )}
          {admin && canEdit && canRemind && isLatest && (
            <button disabled={reminding} onClick={remindUnpaid}>
              🔔 {reminding ? "Sending…" : "Remind unpaid"}
            </button>
          )}
          {admin && canEdit && (
            <button
              className="pri"
              disabled={!dirtyFlats.size || saving}
              onClick={saveAll}
            >
              💾 {saving ? "Saving…" : "Save All"}
              {dirtyFlats.size ? ` (${dirtyFlats.size})` : ""}
            </button>
          )}
          {onClearAll && canEdit && (
            <button className="danger" onClick={clearMonthAmounts}>
              🧹 Clear expense amounts
            </button>
          )}
        </span>
      </div>
      {admin && (
        <div
          className="month-lifecycle-actions"
          aria-label="Month administration actions"
        >
          {!isCompleted && transferred && onCancelMonthTransfer && (
            <button
              type="button"
              className="danger"
              onClick={() => void onCancelMonthTransfer()}
            >
              Undo previous transfer
            </button>
          )}
          {!isCompleted && (
            <button
              type="button"
              className={m.archived ? "pri" : "danger"}
              onClick={async () => {
                const action = m.archived ? "unarchiveMonth" : "archiveMonth";
                const confirmed = await openConfirm({
                  title: m.archived
                    ? `Unarchive ${label(m.month)}?`
                    : `Archive ${label(m.month)}?`,
                  message: m.archived
                    ? "This will make the month editable again."
                    : "This month will become read-only. Payments, expenses, and billing settings cannot be changed until it is unarchived.",
                  confirmLabel: m.archived
                    ? "Unarchive month"
                    : "Archive month",
                });
                if (confirmed) await onSave({ action, month: m.month });
              }}
            >
              {m.archived ? "Unarchive month" : "Archive month"}
            </button>
          )}
          {onDelete && !isCompleted && (
            <button type="button" className="danger" onClick={onDelete}>
              Delete month
            </button>
          )}
        </div>
      )}
      {(m.archived || isCompleted) && (
        <div
          className="due-date-notice"
          role="status"
          style={{
            borderColor: "#b45309",
            color: "#92400e",
            background: "#fff7ed",
          }}
        >
          {isCompleted ? (
            <>
              <b>Completed month — read-only.</b>{" "}
              {m.notes?.completion?.carriedFlats
                ? `${m.notes?.completion?.carriedFlats} flat(s) had unpaid amounts carried forward to ${m.notes?.completion?.nextMonth}.`
                : "No unpaid flat amounts needed to be carried forward."}{" "}
              Use Undo Complete to reverse these changes.
            </>
          ) : (
            <>
              <b>Archived month — read-only.</b> Unarchive this month to edit
              expenses, billing settings, or payments.
            </>
          )}
        </div>
      )}
      {carryForwardEntries.length > 0 && (
        <section
          className="due-date-notice"
          role="status"
          aria-label="Carried-forward dues summary"
        >
          <b>Carried forward since {carryForwardSourceDate}:</b>{" "}
          <span
            title={`Calculation: add each flat's carried-forward Maintenance amount and Corp Fund amount, then sum across ${carryForwardEntries.length} flat(s). Combined arrears are stored in Maintenance; split arrears stay in their respective columns.`}
            aria-label={`Carried-forward total calculation: ${carryForwardEntries.length} flats; total ${inr(carryForwardTotal)}`}
            style={{
              cursor: "help",
              textDecoration: "underline dotted",
              textUnderlineOffset: 3,
            }}
          >
            {inr(carryForwardTotal)}
          </span>{" "}
          from {carryForwardSourceDate}, across {carryForwardEntries.length}{" "}
          flat(s). Combined arrears are included in Maintenance; split arrears
          remain in their respective columns.
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              View carried-forward flat details
            </summary>
            <div
              className="scroll"
              style={{ marginTop: 8, background: "var(--card, #fff)" }}
            >
              <table>
                <thead>
                  <tr>
                    <th>Flat</th>
                    {admin && <th>Flat name</th>}
                    <th>Maintenance arrears</th>
                    <th>Corp Fund arrears</th>
                    <th>Total carried forward</th>
                    <th>Calculation</th>
                  </tr>
                </thead>
                <tbody>
                  {[...carryForwardEntries]
                    .sort(([a], [b]) => {
                      const ai = flats.findIndex((f) => f.flat === a);
                      const bi = flats.findIndex((f) => f.flat === b);
                      return (
                        (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) -
                          (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) ||
                        a.localeCompare(b)
                      );
                    })
                    .map(([flatNo, amount]) => {
                      const flatInfo = flats.find((f) => f.flat === flatNo);
                      const maintenance = Number(amount?.maintenance) || 0;
                      const corp = Number(amount?.corp) || 0;
                      const totalCarry = maintenance + corp;
                      return (
                        <tr key={flatNo}>
                          <td>
                            <b>{flatNo}</b>
                          </td>
                          {admin && <td>{flatInfo?.name || "—"}</td>}
                          <td className="r">{inr(maintenance)}</td>
                          <td className="r">{inr(corp)}</td>
                          <td className="r">
                            <b>{inr(totalCarry)}</b>
                          </td>
                          <td
                            title={`${inr(maintenance)} Maintenance + ${inr(corp)} Corp Fund = ${inr(totalCarry)}`}
                          >
                            {amount?.combined
                              ? "Combined arrears (in Maintenance)"
                              : "Separate Maintenance + Corp Fund"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={admin ? 2 : 1}>
                      <b>Total</b>
                    </td>
                    <td className="r">
                      <b>
                        {inr(
                          carryForwardEntries.reduce(
                            (sum, [, a]) => sum + (Number(a?.maintenance) || 0),
                            0,
                          ),
                        )}
                      </b>
                    </td>
                    <td className="r">
                      <b>
                        {inr(
                          carryForwardEntries.reduce(
                            (sum, [, a]) => sum + (Number(a?.corp) || 0),
                            0,
                          ),
                        )}
                      </b>
                    </td>
                    <td className="r">
                      <b>{inr(carryForwardTotal)}</b>
                    </td>
                    <td title="Total carried forward = total Maintenance arrears + total Corp Fund arrears">
                      Sum of flat totals
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        </section>
      )}
      <fieldset
        disabled={!canEdit}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {isDueDatePassed(m.month, settings.dueDay) && (
          <div className="due-date-notice" role="status">
            Payment due date ({dueDateText(m.month, settings.dueDay)}) has
            passed. Flats with outstanding balances are highlighted below.
          </div>
        )}
        {admin && (
          <section
            className="card"
            aria-label="Monthly workflow"
            style={{ marginTop: 12 }}
          >
            <div className="settings-section-heading">
              <div>
                <h3 style={{ marginBottom: 4 }}>Monthly workflow</h3>
                <p className="muted" style={{ margin: 0 }}>
                  <b>Start of month:</b> confirm the maintenance and Corp Fund
                  rates, then record each flat’s combined payment.{" "}
                  <b>End of month:</b> update actual expenses, then Complete the
                  month to transfer any positive combined balance and carry
                  forward unpaid dues.
                </p>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginTop: 12,
              }}
            >
              <div className="settings-example">
                <span className="muted">Expected combined charges</span>
                <strong style={{ display: "block", fontSize: "1.15rem" }}>
                  {inr(mergeMaintenanceCorp ? due : due + cd)}
                </strong>
                <span className="muted">
                  Maintenance{" "}
                  {inr(mergeMaintenanceCorp ? maintenanceBaseDue : due)} + Corp
                  Fund {inr(cd)}
                </span>
              </div>
              <div className="settings-example">
                <span className="muted">Collected so far</span>
                <strong style={{ display: "block", fontSize: "1.15rem" }}>
                  {inr(actualTotalPaid)}
                </strong>
                <span className="muted">
                  Maintenance {inr(mpd)} + Corp Fund {inr(cpd)}
                </span>
              </div>
            </div>
          </section>
        )}
        {showBulk && admin && (
          <div className="card">
            <b>Bulk fill payments</b>
            <span className="muted">
              Fill the boxes below for every flat at once — handy for flats
              still left blank. "Total paid" is split per flat into Maintenance
              and Corp Fund by that flat's dues (rule in Settings). Nothing is
              saved to the database until you click Save All.
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
              {!mergeMaintenanceCorp && (
                <label className="opt">
                  <span>Maint. paid</span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder="e.g. 3400"
                    value={bulk.maint}
                    onChange={(e) =>
                      setBulk({ ...bulk, maint: e.target.value })
                    }
                  />
                </label>
              )}
              {!mergeMaintenanceCorp && (
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
              )}
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
                    setBulk({
                      ...bulk,
                      scope: e.target.value as "all" | "empty",
                    })
                  }
                >
                  <option value="empty">Empty rows only</option>
                  <option value="all">All flats (overwrite)</option>
                </select>
              </label>
            </div>
            <div className="row">
              <span className="muted">
                This only fills the boxes below — review each row, then click
                Save All to write them to the database.
              </span>
              <button className="pri" onClick={applyBulk}>
                Apply to flats
              </button>
            </div>
          </div>
        )}
        <Expenses
          flats={flats}
          m={m}
          admin={admin}
          superAdmin={superAdmin}
          onSave={async (body) => {
            const ok = await onSave(body);
            // Keep the Flats table visible after an expense save or recalculation.
            // Saving actual expense lines alone preserves the current billing total;
            // only the explicit Recalculate action changes maintenance dues.
            if (ok && body.action === "saveMonth") setStatusFilter("all");
            return ok;
          }}
          settings={settings}
        />
        {admin && (
          <section
            className="card"
            aria-label="Month-end reconciliation"
            style={{ marginTop: 12 }}
          >
            <div className="settings-section-heading">
              <div>
                <h3 style={{ marginBottom: 4 }}>Month-end reconciliation</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Complete the month to transfer any positive balance
                  (Maintenance + Corp Fund collected − actual expenses) to the
                  Corp Fund and carry forward unpaid dues. You can undo
                  completion to restore the previous values.
                </p>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginTop: 12,
              }}
            >
              <div className="settings-example">
                <span className="muted">Maintenance + Corp Fund collected</span>
                <strong style={{ display: "block", fontSize: "1.1rem" }}>
                  {inr(actualTotalPaid)}
                </strong>
                <span className="muted">
                  Maintenance {inr(mpd)} + Corp Fund {inr(cpd)}
                </span>
              </div>
              <div className="settings-example">
                <span className="muted">Actual expenses</span>
                <strong style={{ display: "block", fontSize: "1.1rem" }}>
                  {inr(total(m))}
                </strong>
              </div>
              <div
                className="settings-example"
                style={{ gridColumn: "1 / -1" }}
              >
                <span className="muted">
                  Remaining amount (Maintenance + Corp Fund collected − actual
                  expenses)
                </span>
                <strong
                  style={{
                    display: "block",
                    fontSize: "1.25rem",
                    color: completionBalance < 0 ? "#9c0006" : "#17365d",
                  }}
                >
                  {inr(completionBalance)}
                </strong>
                {completionBalance > 0 ? (
                  <span className="muted">
                    Complete will deposit this positive balance into the Corp
                    Fund. Undo Complete restores the prior ledger and
                    carry-forward values.
                  </span>
                ) : completionBalance < 0 ? (
                  <span className="muted">
                    Complete will record a Corp Fund withdrawal to cover this
                    shortfall. Undo Complete restores the prior ledger and
                    carry-forward values.
                  </span>
                ) : (
                  <span className="muted">
                    The balance is zero, so Complete will not create a ledger
                    entry. Unpaid flat dues can still be carried forward.
                  </span>
                )}
              </div>
            </div>
          </section>
        )}
        <div className="row month-table-toolbar" style={{ flexWrap: "wrap" }}>
          <div className="month-table-toolbar-actions">
            {admin && canEdit && (
              <button
                type="button"
                className="danger"
                onClick={clearFlatPaymentAmounts}
              >
                Clear flat payment amounts
              </button>
            )}
          </div>
          <label className="opt">
            <span>Payment status</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | Status)
              }
            >
              <option value="all">All ({flats.length})</option>
              <option value="paid">
                Fully paid ({flats.filter((f) => statusOf(f) === "paid").length}
                )
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
          {(statusFilter !== "all" || q) && (
            <span className="muted">
              Showing {visibleFlats.length} of {flats.length} flats. Totals
              below are still for all flats.
            </span>
          )}
        </div>
        <div className="month-section-note">
          <div>
            <h3>▶ Monthly payments</h3>
            <p className="muted">
              Maintenance and Corp Fund payments are shown separately below.
              Complete records the combined month-end balance in the Corp Fund
              ledger and carries forward unpaid dues.
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
                    corpMethod: m.corp_method || "sqft",
                    corpValue: m.corp_value ?? m.corp_rate ?? 0.5,
                    corp2Bhk: m.corp_2bhk ?? null,
                    corp3Bhk: m.corp_3bhk ?? null,
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
        {settings.isBlocks === true && blockNames.length > 0 && (
          <section
            className="card"
            aria-label="Block filter"
            style={{ marginTop: 12 }}
          >
            <div className="settings-section-heading">
              <div>
                <h3>Block</h3>
                <p className="muted">
                  Filter the Months view by block. Billing calculations remain
                  month-wide; block-specific expenses are allocated only to
                  flats in that block.
                </p>
              </div>
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                aria-label="Filter by block"
              >
                <option value="all">All Blocks</option>
                {blockNames.map((block) => (
                  <option key={block} value={block}>
                    {block}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}
        <section
          className="card month-payment-section"
          aria-label="Maintenance payments"
        >
          <div className="settings-section-heading">
            <div>
              <h3>Maintenance payments</h3>
              <p className="muted">
                {mergeMaintenanceCorp
                  ? "Combined Maintenance + Corp Fund charges and one total payment entry, stored under Maintenance."
                  : "Maintenance charges, amounts received, and maintenance collection totals."}
              </p>
            </div>
            <strong>
              {inr(mergeMaintenanceCorp ? due : due)} expected ·{" "}
              {inr(mergeMaintenanceCorp ? mpd : mpd)} collected
            </strong>
          </div>
          {renderPaymentTable(maintenanceCols, "maintenance")}
        </section>
        {corpFundEnabled && !mergeMaintenanceCorp && (
          <section
            className="card month-payment-section"
            aria-label="Corp Fund payments"
          >
            <div className="settings-section-heading">
              <div>
                <h3>Corp Fund payments</h3>
                <p className="muted">
                  Corp Fund charges and amounts received from each flat.
                  Complete records the positive combined month-end balance as a
                  Corp Fund deposit.
                </p>
                <p className="month-payment-surplus">
                  Month-end Corp Fund adjustment:{" "}
                  <strong>
                    {transferred
                      ? `${transferred.kind === "withdrawal" ? "Withdrawal " : "Deposit "}${inr(Number(transferred.amount) || 0)}`
                      : inr(0)}
                  </strong>
                  {transferred
                    ? " · Adjustment recorded"
                    : " · No adjustment recorded"}
                </p>
              </div>
              <strong>
                {inr(cd)} expected · {inr(cpd)} collected
              </strong>
            </div>
            {renderPaymentTable(corpCols, "corp")}
          </section>
        )}
        {corpFundEnabled && (
          <section
            className="card month-payment-section"
            aria-label="Maintenance and Corp Fund summary"
          >
            <div className="settings-section-heading">
              <div>
                <h3>Maintenance + Corp Fund Summary</h3>
                <p className="muted">
                  A month-end snapshot of expected charges, actual payments
                  received, and the balance after actual expenses.
                </p>
                <div className="month-summary-context">
                  <span>
                    <i className="summary-dot expected" /> Expected charges{" "}
                    <strong>{inr(due + cd)}</strong>
                  </span>
                  <span>
                    <i className="summary-dot collected" /> Total collected{" "}
                    <strong>{inr(actualTotalPaid)}</strong>
                  </span>
                  <span>
                    <i className="summary-dot expenses" /> Actual expenses{" "}
                    <strong>{inr(total(m))}</strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="scroll month-scroll">
              <table className="month-payments-table month-financial-summary">
                <caption>Monthly financial summary</caption>
                <thead>
                  <tr>
                    <th>Summary</th>
                    <th className="r">Expected</th>
                    <th className="r">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Maintenance</td>
                    <td className="r">{inr(due)}</td>
                    <td className="r">{inr(mpd)}</td>
                  </tr>
                  <tr>
                    <td>Corp Fund</td>
                    <td className="r">{inr(cd)}</td>
                    <td className="r">{inr(cpd)}</td>
                  </tr>
                  <tr className="month-summary-total">
                    <th>Total</th>
                    <th className="r">{inr(due + cd)}</th>
                    <th className="r">{inr(actualTotalPaid)}</th>
                  </tr>
                  <tr className="month-summary-remaining">
                    <th>
                      <span>Remaining amount</span>
                      <small>Actual total collected − actual expenses</small>
                    </th>
                    <td className="r">—</td>
                    <td
                      className={`r ${actualTotalPaid - total(m) < 0 ? "amount-negative" : "amount-positive"}`}
                    >
                      {inr(actualTotalPaid - total(m))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}
        <p className="legend">
          <i className="dot paid" /> Fully paid <i className="dot unpaid" />{" "}
          Unpaid{" "}
          {(statusFilter !== "all" || q) && visibleFlats.length === 0 && (
            <b>No flats match this filter.</b>
          )}
          {flats.some((f) => isMaintExcluded(m, f)) && (
            <>
              <i className="dot excluded" /> Excluded from maintenance
              calculation
            </>
          )}
        </p>
      </fieldset>
    </>
  );
}
