import type { Data, Flat } from "../../../shared/types";
import { inr, label, total, snapshotOf, vsum } from "../../../shared/lib.js";
import { openConfirm } from "../../components/ui/appDialog.js";

// Month selector (pills) plus combined Maintenance + Corp Fund figures for the selected month.
export default function MonthBar({
  data,
  flats,
  month,
  onSelect,
  admin = false,
  onCompleteMonth,
  onUndoCompleteMonth,
}: {
  data: Data;
  flats: Flat[];
  month: string;
  onSelect: (month: string) => void;
  admin?: boolean;
  onCompleteMonth?:
    ((combineCarryForward: boolean) => Promise<boolean | void>) | null;
  onUndoCompleteMonth?: (() => Promise<boolean | void>) | null;
}) {
  const m = data.months.find((x) => x.month === month);
  if (!m) return null;
  const pays = data.payments.filter((p) => p.month === month);
  const snap = snapshotOf(flats, m, pays, data.settings.isBlocks === true);
  const due = vsum(snap.due),
    paid = vsum(snap.paid),
    cdue = vsum(snap.cdue),
    cpaid = vsum(snap.cpaid);
  const combinedDue = due + cdue;
  const combinedPaid = paid + cpaid;
  const combinedBalance = combinedDue - combinedPaid;
  const completionBalance = Math.round((combinedPaid - total(m)) * 100) / 100;
  const isCompleted = Boolean(m.notes?.completion);
  const isArchived = Boolean(m.archived);
  const items = [
    ["Actual expenses", total(m), ""],
    [
      "Maintenance + Corp Fund collected",
      combinedPaid,
      `of ${inr(combinedDue)} expected`,
    ],
    ["Combined balance pending", combinedBalance, "Due − collected"],
  ];
  return (
    <div className="monthbar">
      <div className="pills" role="tablist" aria-label="Select month">
        {data.months.map((x) => (
          <button
            key={x.month}
            role="tab"
            aria-selected={x.month === month}
            className={"pill" + (x.month === month ? " on" : "")}
            onClick={() => onSelect(x.month)}
          >
            {label(x.month)}
          </button>
        ))}
      </div>
      <div className="month-kpis">
        {items.map(([k, v, sub]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{inr(v)}</b>
            {sub && <em>{sub}</em>}
          </div>
        ))}
      </div>
      {admin && (
        <div
          className="monthbar-lifecycle-actions"
          aria-label="Month completion actions"
        >
          <span
            className={
              isCompleted ? "month-state archived" : "month-state active"
            }
          >
            {isCompleted
              ? "Completed · Read-only"
              : isArchived
                ? "Archived · Unarchive to complete"
                : "Month not completed"}
          </span>
          {isCompleted ? (
            <button
              type="button"
              className="pri"
              onClick={async () => {
                const confirmed = await openConfirm({
                  title: `Undo Complete for ${label(m.month)}?`,
                  message:
                    "This restores the previous Corp Fund transfer and removes the unpaid-amount carry-forward created by Complete. The month will become editable again.",
                  confirmLabel: "Undo Complete",
                  danger: true,
                });
                if (confirmed) await onUndoCompleteMonth?.();
              }}
            >
              Undo Complete
            </button>
          ) : (
            <button
              type="button"
              className="pri"
              disabled={isArchived || !onCompleteMonth}
              title={
                isArchived
                  ? "Unarchive this month before completing it."
                  : "Complete this month and carry forward unpaid dues."
              }
              onClick={async () => {
                if (isArchived || !onCompleteMonth) return;
                const confirmed = await openConfirm({
                  title: `Complete ${label(m.month)}?`,
                  message: `The combined balance (Maintenance + Corp Fund collected − actual expenses) is ${inr(completionBalance)}. A positive balance will be deposited into the Corp Fund; a negative balance will be recorded as a Corp Fund withdrawal to cover the shortfall; zero creates no ledger entry. Full dues for flats with no payments will be carried forward, and this month will become read-only until you undo completion.`,
                  confirmLabel: "Complete month",
                });
                if (!confirmed) return;
                const combine = await openConfirm({
                  title: "How should unpaid amounts carry forward?",
                  message:
                    "Choose “Combine into one amount” to add Maintenance + Corp Fund arrears together under the Maintenance amount in the next month. Choose Cancel to keep Maintenance and Corp Fund arrears separate. Completion will continue either way.",
                  confirmLabel: "Combine into one amount",
                });
                await onCompleteMonth(combine);
              }}
            >
              Complete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
