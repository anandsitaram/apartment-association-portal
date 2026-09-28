import { useState } from "react";
import { usePersistentState } from "../usePersistentState.js";
import type { Data, Flat } from "../../shared/types";
import type { Save } from "../api.js";
import { buildSummary, inr, label, n2, sum, vsum } from "../lib.js";
import { openConfirm } from "./ui/appDialog.js";
import MonthPicker from "./ui/MonthPicker.jsx";

export default function CorpusFund({
  data,
  flats,
  admin,
  superAdmin,
  onSave,
}: {
  data: Data;
  flats: Flat[];
  admin: boolean;
  superAdmin: boolean;
  onSave: Save;
}) {
  const [kind, setKind] = usePersistentState("rv_corpus_kind", "deposit");
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [month, setMonth] = useState("");
  const [busy, setBusy] = useState(false);

  const S = buildSummary(data, flats);
  const collectedFromFlats = sum(S.ms, (v) => vsum(v.cpaid));
  const ledger = data.corpusLedger || [];
  const deposits = sum(
    ledger.filter((e) => e.kind === "deposit"),
    (e) => +e.amount,
  );
  const withdrawals = sum(
    ledger.filter((e) => e.kind === "withdrawal"),
    (e) => +e.amount,
  );
  const balance = collectedFromFlats + deposits - withdrawals;

  const monthlyCorp = S.ms.map((v) => ({
    month: v.month,
    collected: vsum(v.cpaid),
  }));
  const recentMonths = monthlyCorp.slice(-3);
  const avgCollected = recentMonths.length
    ? sum(recentMonths, (r) => r.collected) / recentMonths.length
    : 0;
  const ledgerByMonth = new Map<string, number>();
  for (const e of ledger) {
    if (!e.month) continue;
    ledgerByMonth.set(
      e.month,
      (ledgerByMonth.get(e.month) || 0) +
        (e.kind === "deposit" ? +e.amount : -+e.amount),
    );
  }
  const avgLedger = recentMonths.length
    ? sum(recentMonths, (r) => ledgerByMonth.get(r.month) || 0) /
      recentMonths.length
    : 0;
  const avgNet = avgCollected + avgLedger;
  const nextMonthKey = (base: string, add: number) => {
    const [y, m] = base.split("-").map(Number);
    const d = new Date(y, m - 1 + add, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const lastMonth =
    monthlyCorp.at(-1)?.month || new Date().toISOString().slice(0, 7);
  const forecast = [1, 2].map((n) => ({
    month: nextMonthKey(lastMonth, n),
    value: balance + avgNet * n,
  }));
  const trend = monthlyCorp.slice(-6);
  const maxTrend = Math.max(1, ...trend.map((t) => t.collected));

  const sorted = [...ledger].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  let running = collectedFromFlats;
  const rows = sorted
    .map((e) => {
      running += e.kind === "deposit" ? +e.amount : -+e.amount;
      return { ...e, running };
    })
    .reverse();

  const add = async () => {
    if (!desc.trim() || !(+amt > 0)) return;
    setBusy(true);
    const ok = await onSave({
      action: "saveCorpusEntry",
      kind,
      description: desc.trim(),
      amount: +amt,
      month: month || undefined,
    });
    setBusy(false);
    if (ok) {
      setDesc("");
      setAmt("");
      setMonth("");
    }
  };

  const del = async (id: number) => {
    if (
      await openConfirm({
        title: "Remove ledger entry?",
        message: "This removes the selected Corpus Fund ledger entry.",
        confirmLabel: "Remove",
        danger: true,
      })
    )
      await onSave({ action: "deleteCorpusEntry", id });
  };

  return (
    <div className="dash">
      <div className="kpi-grid">
        <div className="kpi kpi-plain kpi-purple">
          <span className="kpi-title">Corpus fund balance</span>
          <div className="kpi-value">{inr(balance)}</div>
          <div className="kpi-note">
            What the corpus fund actually holds right now
          </div>
        </div>
        <div className="mini">
          <span>Collected from flats</span>
          <b>{inr(collectedFromFlats)}</b>
        </div>
        <div className="mini">
          <span>Other deposits</span>
          <b>{inr(deposits)}</b>
        </div>
        <div className="mini">
          <span>Withdrawals (used)</span>
          <b>{inr(withdrawals)}</b>
        </div>
      </div>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Forecast (next 2 months)</h2>
            <p>
              Based on the average net corpus fund inflow over the last{" "}
              {recentMonths.length || 0} recorded month
              {recentMonths.length === 1 ? "" : "s"} — a simple trend
              projection, not a guarantee.
            </p>
          </div>
        </div>
        <div className="kpi-grid">
          {forecast.map((f) => (
            <div className="mini" key={f.month}>
              <span>{label(f.month)}</span>
              <b>{inr(f.value)}</b>
            </div>
          ))}
          <div className="mini">
            <span>Avg. monthly net (recent)</span>
            <b className={avgNet < 0 ? "neg" : "pos"}>
              {avgNet < 0 ? "−" : "+"}
              {inr(Math.abs(avgNet))}
            </b>
          </div>
        </div>
        {trend.length > 0 && (
          <div className="trend-bars">
            {trend.map((t) => (
              <div
                className="trend-bar"
                key={t.month}
                title={`${label(t.month)}: ${inr(t.collected)}`}
              >
                <div
                  className="trend-bar-fill"
                  style={{
                    height: `${Math.max(4, (t.collected / maxTrend) * 100)}%`,
                  }}
                />
                <span>{label(t.month).split(" ")[0]}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Corpus fund ledger</h2>
            <p>
              Every rupee added to or spent from the corpus fund, on top of what
              flats pay monthly.
              {admin
                ? " Use a withdrawal entry whenever you spend from the fund (repairs, a big-ticket purchase, etc.)."
                : ""}
            </p>
          </div>
        </div>

        {admin && (
          <div className="corpus-form">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              aria-label="Entry type"
            >
              <option value="deposit">Deposit (money added)</option>
              <option value="withdrawal">Withdrawal (money used)</option>
            </select>
            <input
              placeholder="What for? e.g. Lift repair, FD interest"
              autoComplete="off"
              value={desc}
              maxLength={120}
              onChange={(e) => setDesc(e.target.value)}
            />
            <input
              type="number"
              step="any"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Amount"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
            />
            <MonthPicker
              clearable
              label="Tag entry to a month (optional)"
              placeholder="Month (optional)"
              value={month}
              onChange={setMonth}
            />
            <button
              className="pri"
              disabled={busy || !desc.trim() || !(+amt > 0)}
              onClick={add}
            >
              + Add entry
            </button>
          </div>
        )}

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th className="text">Date</th>
                <th className="text">Month</th>
                <th className="text">Description</th>
                <th className="text">Type</th>
                <th>Amount</th>
                <th>Running balance</th>
                {superAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="text" colSpan={superAdmin ? 7 : 6}>
                    No entries yet — the balance above is just what flats have
                    paid in.
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="text">
                    {new Date(e.at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="text">{e.month ? label(e.month) : "—"}</td>
                  <td className="text">
                    {e.description}
                    {e.source === "month_end" && (
                      <span className="muted"> (auto)</span>
                    )}
                  </td>
                  <td className="text">
                    {e.kind === "deposit" ? "Deposit" : "Withdrawal"}
                  </td>
                  <td className={e.kind === "deposit" ? "pos" : "neg"}>
                    {e.kind === "deposit" ? "+" : "−"}
                    {n2(e.amount)}
                  </td>
                  <td className="strong-number">{n2(e.running)}</td>
                  {superAdmin && (
                    <td className="text">
                      {e.source === "manual" && (
                        <button className="danger" onClick={() => del(e.id)}>
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
