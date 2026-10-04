import type { LedgerEntry } from "../../../shared/types";
import { inr } from "../../../shared/lib.js";

interface MonthTransferControlProps {
  month: string;
  remaining: number;
  transferred?: LedgerEntry;
  decision: "keep" | "transfer";
  onDecisionChange: (decision: "keep" | "transfer") => void;
  onTransfer: (remaining: number) => unknown;
  onCancelTransfer?: (() => unknown) | null;
}

/** Month-end maintenance surplus decision, separated from the payment table. */
export default function MonthTransferControl({
  month,
  remaining,
  transferred,
  decision,
  onDecisionChange,
  onTransfer,
  onCancelTransfer,
}: MonthTransferControlProps) {
  return (
    <div
      className="month-transfer-control"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        border: "1px solid var(--border, #d8deea)",
        borderRadius: 10,
        background: "var(--surface-soft, #f8f9fc)",
      }}
    >
      <strong style={{ fontSize: ".95rem" }}>
        What should happen to the remaining balance?
      </strong>
      <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name={`transfer-decision-${month}`}
            checked={decision === "keep"}
            onChange={() => onDecisionChange("keep")}
          />
          <span>Keep in Maintenance (do not transfer)</span>
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name={`transfer-decision-${month}`}
            checked={decision === "transfer"}
            onChange={() => onDecisionChange("transfer")}
          />
          <span>Transfer to Corp Fund</span>
        </label>
      </div>
      <span className="muted" style={{ fontSize: ".82rem" }}>
        Remaining maintenance balance:{" "}
        <strong>{inr(Math.max(remaining, 0))}</strong>
        {transferred
          ? ` · Currently transferred to Corp Fund: ${inr(Number(transferred.amount) || 0)}`
          : " · No transfer is currently recorded"}
      </span>
      {decision === "transfer" ? (
        <div>
          <button
            className="pri"
            disabled={remaining <= 0}
            title={
              remaining <= 0
                ? "No positive maintenance surplus is available to transfer"
                : "Transfer the remaining maintenance balance into the Corp Fund ledger"
            }
            onClick={() => {
              void onTransfer(remaining);
            }}
          >
            🏦{" "}
            {transferred
              ? "Update Corp Fund transfer"
              : `Transfer ${inr(remaining)} to Corp Fund`}
          </button>
        </div>
      ) : transferred && onCancelTransfer ? (
        <div>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (onCancelTransfer) void onCancelTransfer();
            }}
            title="Remove the month-end transfer and leave this amount untransferred"
          >
            Keep in Maintenance (undo transfer)
          </button>
        </div>
      ) : (
        <span className="muted">
          No transfer will be made. The remaining balance will stay
          untransferred.
        </span>
      )}
    </div>
  );
}
