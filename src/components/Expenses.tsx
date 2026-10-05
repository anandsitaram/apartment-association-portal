import { useEffect, useState } from "react";
import type { Expense, Flat, Month, Settings } from "../../shared/types";
import type { Save } from "../api.js";
import { calcText, expFromHeads, inr, rnd, sum } from "../../shared/lib.js";
import { openConfirm } from "./ui/appDialog.js";

// A month starts in expected-expense mode. Calculating maintenance saves the
// expected total as the month's billing basis; the same rows then become the
// actual-expense ledger, which can be edited and saved without changing dues.
export default function Expenses({
  m,
  flats,
  admin,
  superAdmin,
  onSave,
  settings,
}: {
  m: Month;
  flats: Flat[];
  admin: boolean;
  superAdmin: boolean;
  onSave: Save;
  settings?: Partial<Settings>;
}) {
  const heads =
    Array.isArray(settings?.expenseHeads) && settings.expenseHeads.length
      ? settings.expenseHeads
      : expFromHeads().map((e) => e.description);
  const start = () =>
    m.expenses?.length
      ? m.expenses
      : expFromHeads(heads, settings?.expenseHeadAmounts);
  const [rows, setRows] = useState<Expense[]>(start);
  const [note, setNote] = useState(m.notes?.expenses || "");
  const [saving, setSaving] = useState(false);
  const [savingRow, setSavingRow] = useState<number | null>(null);
  const [editingCalculation, setEditingCalculation] = useState(false);
  const [method, setMethod] = useState<Month["method"]>(m.method || "divide");
  const [maintValue, setMaintValue] = useState(
    String(m.value ?? (m.method === "divide" ? flats.length : 0)),
  );
  const [rounding, setRounding] = useState<Month["rounding"]>(
    m.rounding || "none",
  );
  const [corpApplicable, setCorpApplicable] = useState(
    m.corp_applicable === true,
  );
  const [mergeMaintenanceCorp, setMergeMaintenanceCorp] = useState(
    m.notes?.mergeMaintenanceCorp === true,
  );
  const [corpMethod, setCorpMethod] = useState<"sqft" | "common">(
    m.corp_method || "sqft",
  );
  const [corpRate, setCorpRate] = useState(
    String(m.corp_value ?? m.corp_rate ?? 0.5),
  );
  const [corpRounding, setCorpRounding] = useState<
    NonNullable<Month["corp_rounding"]>
  >(m.corp_rounding || "nearest");
  const stage = m.notes?.expensesStage === "actual" ? "actual" : "expected";
  const monthLabel = (() => {
    const [year, month] = m.month.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  })();
  useEffect(() => {
    setRows(start());
    setNote(m.notes?.expenses || "");
    setMethod(m.method || "divide");
    setMaintValue(
      String(m.value ?? (m.method === "divide" ? flats.length : 0)),
    );
    setRounding(m.rounding || "none");
    setCorpApplicable(m.corp_applicable === true);
    setMergeMaintenanceCorp(m.notes?.mergeMaintenanceCorp === true);
    setCorpMethod(m.corp_method || "sqft");
    setCorpRate(String(m.corp_value ?? m.corp_rate ?? 0.5));
    setCorpRounding(m.corp_rounding || "nearest");
    setEditingCalculation(false);
  }, [m.month, JSON.stringify(m.expenses)]);
  const upd = (i: number, k: keyof Expense, v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const t = sum(rows, (r) => +r.amount);
  const divisor = Math.max(flats.length, 1);
  const blockNames = Array.from(
    new Set(flats.map((f) => String(f.block || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  // Once maintenance has been calculated, actual-expense edits must not change
  // the saved billing basis or divisor. Only an explicit recalculation uses the
  // current flat count and selected billing settings.
  const savedDivisor = Math.max(Number(m.value) || divisor, 1);
  const displayDivisor =
    stage === "actual" && !editingCalculation && m.method === "divide"
      ? savedDivisor
      : divisor;
  // Keep the previously calculated basis while merely editing actual expenses.
  // Once the admin opens the calculation editor, preview and recalculate from
  // the current expense rows. Older months may have a stale saved basis of 0.
  const billingBasisTotal =
    stage === "actual" && !editingCalculation
      ? (m.calculated_expense_total ?? t)
      : t;
  const displayRounding =
    stage === "actual" && !editingCalculation
      ? m.rounding || rounding
      : rounding;
  const perFlatBeforeRounding = billingBasisTotal / displayDivisor;
  const perFlatAfterRounding = rnd(perFlatBeforeRounding, displayRounding);
  const valueForSave = (recalculate: boolean) =>
    stage === "actual" && !recalculate
      ? (m.value ??
        (m.method === "divide" ? divisor : Math.max(0, +maintValue || 0)))
      : method === "divide"
        ? divisor
        : Math.max(0, +maintValue || 0);
  const draft = {
    ...m,
    expenses: rows,
    calculated_expense_total:
      stage === "expected" ? t : m.calculated_expense_total,
    method:
      stage === "actual" && !editingCalculation ? m.method || method : method,
    value:
      stage === "actual" && !editingCalculation
        ? (m.value ??
          (method === "divide" ? divisor : Math.max(0, +maintValue || 0)))
        : method === "divide"
          ? divisor
          : Math.max(0, +maintValue || 0),
    rounding:
      stage === "actual" && !editingCalculation
        ? m.rounding || rounding
        : rounding,
    corp_applicable:
      stage === "actual" && !editingCalculation
        ? m.corp_applicable === true
        : corpApplicable,
    corp_method:
      stage === "actual" && !editingCalculation
        ? m.corp_method || corpMethod
        : corpMethod,
    corp_rate:
      stage === "actual" && !editingCalculation
        ? (m.corp_value ?? m.corp_rate ?? +corpRate)
        : Math.max(0, +corpRate || 0),
    corp_value:
      stage === "actual" && !editingCalculation
        ? (m.corp_value ?? m.corp_rate ?? +corpRate)
        : Math.max(0, +corpRate || 0),
    corp_rounding:
      stage === "actual" && !editingCalculation
        ? m.corp_rounding || corpRounding
        : corpRounding,
    notes: {
      ...(m.notes || {}),
      mergeMaintenanceCorp:
        stage === "actual" && !editingCalculation
          ? m.notes?.mergeMaintenanceCorp === true
          : mergeMaintenanceCorp,
    },
  };
  const saveExpenses = async (recalculate: boolean) => {
    setSaving(true);
    try {
      return await onSave({
        action: "saveMonth",
        month: m.month,
        expenses: rows.map((r) => ({
          ...r,
          description: r.description,
          amount: +r.amount || 0,
        })),
        method,
        value: valueForSave(recalculate),
        rounding,
        corpApplicable,
        corpMethod,
        corpRate: Math.max(0, +corpRate || 0),
        corpValue: Math.max(0, +corpRate || 0),
        corpRounding,
        notes: {
          ...(m.notes || {}),
          expenses: note.trim(),
          expensesStage: "actual",
          mergeMaintenanceCorp:
            stage === "actual" && !editingCalculation
              ? m.notes?.mergeMaintenanceCorp === true
              : mergeMaintenanceCorp,
        },
        recalculate,
      });
    } finally {
      setSaving(false);
    }
  };
  const saveExpenseRow = async (rowIndex: number) => {
    if (!admin || saving || savingRow !== null) return;
    setSavingRow(rowIndex);
    try {
      await onSave({
        action: "saveMonth",
        month: m.month,
        expenses: rows.map((r) => ({
          ...r,
          description: r.description,
          amount: +r.amount || 0,
        })),
        method: stage === "actual" ? m.method || method : method,
        value:
          stage === "actual"
            ? (m.value ?? valueForSave(false))
            : valueForSave(false),
        rounding: stage === "actual" ? m.rounding || rounding : rounding,
        corpApplicable:
          stage === "actual" ? m.corp_applicable === true : corpApplicable,
        corpMethod:
          stage === "actual" ? m.corp_method || corpMethod : corpMethod,
        corpRate:
          stage === "actual"
            ? (m.corp_value ?? m.corp_rate ?? +corpRate)
            : Math.max(0, +corpRate || 0),
        corpValue:
          stage === "actual"
            ? (m.corp_value ?? m.corp_rate ?? +corpRate)
            : Math.max(0, +corpRate || 0),
        corpRounding:
          stage === "actual" ? m.corp_rounding || corpRounding : corpRounding,
        notes: {
          ...(m.notes || {}),
          expenses: note.trim(),
          expensesStage: stage,
        },
        recalculate: false,
      });
    } finally {
      setSavingRow(null);
    }
  };
  const resetCalculation = async () => {
    if (!superAdmin || saving) return;
    const confirmed = await openConfirm({
      title: "Reset maintenance calculation?",
      message:
        "Billing settings will become editable again. Existing payments will not be deleted.",
      confirmLabel: "Reset calculation",
      danger: true,
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      const saved = await onSave({
        action: "saveMonth",
        month: m.month,
        expenses: rows.map((r) => ({
          ...r,
          description: r.description,
          amount: +r.amount || 0,
        })),
        method,
        value:
          m.value ??
          (method === "divide" ? divisor : Math.max(0, +maintValue || 0)),
        rounding,
        corpApplicable,
        corpMethod,
        corpRate: Math.max(0, +corpRate || 0),
        corpValue: Math.max(0, +corpRate || 0),
        corpRounding,
        notes: {
          ...(m.notes || {}),
          expenses: note.trim(),
          expensesStage: "expected",
          mergeMaintenanceCorp,
        },
        recalculate: false,
      });
      if (saved) setEditingCalculation(false);
    } finally {
      setSaving(false);
    }
  };
  const cancelCalculationEdit = () => {
    setMethod(m.method || "divide");
    setMaintValue(
      String(m.value ?? (m.method === "divide" ? flats.length : 0)),
    );
    setRounding(m.rounding || "none");
    setCorpApplicable(m.corp_applicable === true);
    setCorpMethod(m.corp_method || "sqft");
    setCorpRate(String(m.corp_value ?? m.corp_rate ?? 0.5));
    setCorpRounding(m.corp_rounding || "nearest");
    setEditingCalculation(false);
  };
  const calculateMaintenance = async () => {
    setSaving(true);
    try {
      const saved = await onSave({
        action: "saveMonth",
        month: m.month,
        expenses: rows.map((r) => ({
          ...r,
          description: r.description,
          amount: +r.amount || 0,
        })),
        method,
        value: method === "divide" ? divisor : Math.max(0, +maintValue || 0),
        rounding,
        corpApplicable,
        corpMethod,
        corpRate: Math.max(0, +corpRate || 0),
        corpValue: Math.max(0, +corpRate || 0),
        corpRounding,
        // Explicit recalculation must use the current expenses, not a stale
        // calculated_expense_total (which may be 0 on older months).
        calculatedExpenseTotal: t,
        notes: {
          ...(m.notes || {}),
          expenses: note.trim(),
          expensesStage: "actual",
          mergeMaintenanceCorp,
        },
        recalculate: true,
      });
      if (saved) setEditingCalculation(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="card">
      <div className="section-heading-row">
        <div>
          <h3>
            ▶{" "}
            {stage === "expected"
              ? "Expected Monthly Expenses"
              : "Actual Monthly Expenses"}
          </h3>
          <p className="muted">
            {stage === "expected"
              ? "Enter the planned expenses and billing options, then calculate the monthly maintenance charge."
              : "Update the expense amounts with actual costs and save. Maintenance charges stay unchanged unless you edit and recalculate them."}
          </p>
        </div>
        {admin ? (
          <label className="month-note-inline">
            <span>Note</span>
            <textarea
              value={note}
              maxLength={500}
              placeholder="Add a note about this month's expenses"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        ) : note ? (
          <p className="month-note-readonly">{note}</p>
        ) : null}
      </div>
      {admin && stage === "actual" && !editingCalculation && (
        <div className="billing-edit-banner">
          <div>
            <b>Maintenance calculation is saved</b>
            <p className="muted">
              To change the maintenance method, amount, rounding, or Corp Fund
              settings for this month, select Edit maintenance calculation.
            </p>
          </div>
          <button type="button" onClick={() => setEditingCalculation(true)}>
            Edit maintenance calculation
          </button>
        </div>
      )}
      {admin && (
        <fieldset
          className="monthly-billing-options"
          disabled={stage !== "expected" && !editingCalculation}
        >
          <legend>Monthly billing settings — {monthLabel}</legend>
          <p className="muted">
            These options are saved with this month. Other months keep their own
            settings. After calculation, use Edit maintenance calculation to
            make changes and recalculate; a Super Admin can reset the month to
            expected-expense mode.
          </p>
          <label className="opt">
            <span>Maintenance calculation</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as Month["method"])}
            >
              <option value="divide">
                Based on expected monthly expenses (total ÷ number of flats)
              </option>
              <option value="common">
                Common amount for all residents (₹)
              </option>
              <option value="sqft">Amount per sq ft (₹ × flat sq ft)</option>
            </select>
          </label>
          {(method === "common" || method === "sqft") && (
            <label className="opt maintenance-charge-value">
              <span>
                {method === "common"
                  ? "Common maintenance amount per flat (₹)"
                  : "Maintenance rate per sq ft (₹)"}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={maintValue}
                onChange={(e) => setMaintValue(e.target.value)}
                placeholder={
                  method === "common"
                    ? "Enter amount per flat"
                    : "Enter rate per sq ft"
                }
                aria-label={
                  method === "common"
                    ? "Common maintenance amount per flat"
                    : "Maintenance rate per square foot"
                }
              />
              <small className="muted">
                {method === "common"
                  ? "The same maintenance amount will be charged to every included flat."
                  : "Each flat’s maintenance is calculated as this rate multiplied by its square feet."}
              </small>
            </label>
          )}
          <label className="opt">
            <span>Corp Fund applicable?</span>
            <select
              value={corpApplicable ? "yes" : "no"}
              onChange={(e) => setCorpApplicable(e.target.value === "yes")}
            >
              <option value="no">
                No — do not charge Corp Fund this month
              </option>
              <option value="yes">Yes — charge Corp Fund this month</option>
            </select>
          </label>
          {corpApplicable && (
            <>
              <label className="opt">
                <span>Corp Fund calculation</span>
                <select
                  value={corpMethod}
                  onChange={(e) =>
                    setCorpMethod(e.target.value as "sqft" | "common")
                  }
                >
                  <option value="sqft">Based on square feet</option>
                  <option value="common">Fixed amount per flat</option>
                </select>
              </label>
              <label className="opt">
                <span>
                  {corpMethod === "sqft"
                    ? "Corp Fund rate (₹ per sq ft)"
                    : "Corp Fund amount (₹ per flat)"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={corpRate}
                  onChange={(e) => setCorpRate(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="opt">
            <span>Merge Maintenance and Corp Fund?</span>
            <select
              value={mergeMaintenanceCorp ? "yes" : "no"}
              onChange={(e) =>
                setMergeMaintenanceCorp(e.target.value === "yes")
              }
            >
              <option value="no">
                No — show separate Maintenance and Corp Fund tables
              </option>
              <option value="yes">
                Yes — show one combined charge and payment entry under
                Maintenance
              </option>
            </select>
            <small className="muted">
              When enabled, the Maintenance rounding rule applies to the
              combined current-month charge.
            </small>
          </label>
          <label className="opt">
            <span>
              {mergeMaintenanceCorp
                ? "Combined charge rounding"
                : "Maintenance rounding"}
            </span>
            <select
              value={rounding}
              onChange={(e) => setRounding(e.target.value as Month["rounding"])}
            >
              <option value="none">None (2 decimals)</option>
              <option value="nearest">Nearest ₹1</option>
              <option value="up">Round up to ₹1</option>
              <option value="up50">Round up to next ₹50</option>
              <option value="up100">Round up to next ₹100</option>
            </select>
          </label>
          {corpApplicable && !mergeMaintenanceCorp && (
            <label className="opt">
              <span>Corp Fund rounding</span>
              <select
                value={corpRounding}
                onChange={(e) =>
                  setCorpRounding(
                    e.target.value as NonNullable<Month["corp_rounding"]>,
                  )
                }
              >
                <option value="none">None (2 decimals)</option>
                <option value="nearest">Nearest ₹1</option>
                <option value="up">Round up to ₹1</option>
              </select>
            </label>
          )}
        </fieldset>
      )}
      <datalist id="expense-heads">
        {heads.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
      {rows.map((r, i) => (
        <div className="row erow" key={i}>
          <input
            disabled={!admin}
            aria-label="Expense description"
            list="expense-heads"
            value={r.description}
            onChange={(e) => upd(i, "description", e.target.value)}
            placeholder="Expense name"
          />
          {settings?.isBlocks === true && (
            <select
              disabled={!admin}
              aria-label="Expense allocation scope"
              title="Choose whether this expense is shared by the association or allocated only within one block"
              value={r.allocationScope || "association"}
              onChange={(e) => {
                const scope = e.target.value as "association" | "block";
                setRows(
                  rows.map((row, j) =>
                    j === i
                      ? {
                          ...row,
                          allocationScope: scope,
                          block:
                            scope === "block"
                              ? row.block || blockNames[0] || ""
                              : null,
                        }
                      : row,
                  ),
                );
              }}
            >
              <option value="association">Association-wide</option>
              <option value="block">Specific block</option>
            </select>
          )}
          {settings?.isBlocks === true &&
            (r.allocationScope || "association") === "block" && (
              <select
                disabled={!admin || blockNames.length === 0}
                aria-label="Expense block"
                title={
                  blockNames.length
                    ? "Block receiving this expense allocation"
                    : "Add a block to one or more flats first"
                }
                value={r.block || ""}
                onChange={(e) => upd(i, "block", e.target.value)}
              >
                <option value="">Select block…</option>
                {blockNames.map((block) => (
                  <option key={block} value={block}>
                    {block}
                  </option>
                ))}
              </select>
            )}
          <input
            disabled={!admin}
            aria-label="Expense amount"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={r.amount}
            onChange={(e) => upd(i, "amount", e.target.value)}
          />
          {admin && (
            <button
              type="button"
              className="expense-row-save"
              disabled={saving || savingRow !== null}
              onClick={() => void saveExpenseRow(i)}
              title={`Save ${r.description || "expense"}`}
            >
              {savingRow === i ? "Saving…" : "Save"}
            </button>
          )}
          {admin && (
            <button
              type="button"
              aria-label={`Remove ${r.description || "expense"}`}
              title="Remove expense line"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="row">
        {settings?.isBlocks === true && blockNames.length > 0 && (
          <p className="muted">
            Association-wide expenses are shared across the configured divisor.
            Specific-block expenses are split only among flats assigned to that
            block. Assign blocks in the Flats tab first.
          </p>
        )}
        {settings?.isBlocks === true && blockNames.length === 0 && (
          <p className="muted">
            For multi-block billing, assign a Block / Building to flats in the
            Flats tab. Expenses can then be allocated association-wide or to a
            specific block.
          </p>
        )}
        <b>
          {stage === "expected"
            ? "Total expected expenses"
            : "Total actual expenses"}
        </b>
        <b>{inr(t)}</b>
      </div>
      <div className="settings-example">
        <b>Maintenance calculation</b>
        <p>
          {mergeMaintenanceCorp && corpApplicable
            ? `${calcText({ ...draft, rounding: "none" })}; Corp Fund is added before the selected rounding is applied to the combined charge.`
            : calcText(draft)}
        </p>
        {method === "divide" ? (
          <>
            <p>
              {inr(billingBasisTotal)} ÷ {displayDivisor} flats ={" "}
              <b>{inr(perFlatBeforeRounding)} per flat</b> before rounding.
            </p>
            {mergeMaintenanceCorp && corpApplicable ? (
              <p>
                Maintenance + Corp Fund are combined per flat and rounded using
                the selected rule. The combined charge is shown in the
                Maintenance payments table.
              </p>
            ) : (
              <p>
                {inr(billingBasisTotal)} ÷ {displayDivisor} flats ={" "}
                <b>{inr(perFlatAfterRounding)} per flat</b> after rounding.
              </p>
            )}
          </>
        ) : (
          <p>Uses the monthly billing method selected above.</p>
        )}
        {admin && (
          <p>
            {corpApplicable
              ? `Corp Fund is enabled for this month (${corpMethod === "common" ? `₹${corpRate} per flat` : `₹${corpRate} per sq ft`}).`
              : "Corp Fund is disabled for this month; no Corp Fund charge will be calculated."}
          </p>
        )}
      </div>
      {admin && (
        <div className="row">
          <button
            type="button"
            onClick={() =>
              setRows([
                ...rows,
                { description: "", amount: 0, allocationScope: "association" },
              ])
            }
          >
            + Add expense
          </button>
          <select
            value=""
            aria-label="Add an expense from the configured list"
            title="Expense names are configured in Settings → Expenses"
            onChange={(e) =>
              e.target.value &&
              setRows([
                ...rows,
                {
                  description: e.target.value,
                  amount: settings?.expenseHeadAmounts?.[e.target.value] || 0,
                  allocationScope: "association",
                },
              ])
            }
          >
            <option value="">Add from list…</option>
            {heads
              .filter((h) => !rows.some((r) => r.description === h))
              .map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
          </select>
          {stage === "expected" ? (
            <button
              className="pri"
              disabled={saving}
              onClick={calculateMaintenance}
              title="Save expected expenses and calculate maintenance dues using the selected Billing method"
            >
              {saving ? "Calculating…" : "Calculate Maintenance Amount"}
            </button>
          ) : (
            <>
              {!editingCalculation && (
                <button
                  className="pri"
                  disabled={saving}
                  onClick={() => void saveExpenses(false)}
                  title="Save actual expenses without changing the maintenance amount"
                >
                  {saving ? "Saving…" : "Save Actual Expenses"}
                </button>
              )}
              {editingCalculation && (
                <>
                  <button
                    className="pri"
                    type="button"
                    disabled={saving}
                    onClick={() => void calculateMaintenance()}
                    title="Save the selected billing options and recalculate maintenance"
                  >
                    {saving
                      ? "Recalculating…"
                      : "Save & recalculate maintenance"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={cancelCalculationEdit}
                  >
                    Cancel edit
                  </button>
                </>
              )}
              {superAdmin && !editingCalculation && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void resetCalculation()}
                  title="Only a Super Admin can return this month to expected-expense mode"
                >
                  Reset Maintenance Calculation
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
