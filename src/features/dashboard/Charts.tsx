import { inr, label } from "../../../shared/lib.js";

export interface MonthPoint {
  month: string;
  due: number;
  paid: number;
  expenses: { description: string; amount: number }[];
}

const short = (n: number) =>
  n >= 1e5
    ? `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`
    : n >= 1e3
      ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
      : String(Math.round(n));

// Maintenance-only collection trend and expense categories. Corp Fund details
// are intentionally kept off the Dashboard.
export default function Charts({ points }: { points: MonthPoint[] }) {
  const last = points.slice(-12);
  const totals = new Map<string, number>();
  for (const p of points)
    for (const e of p.expenses || [])
      totals.set(
        e.description,
        (totals.get(e.description) || 0) + (Number(e.amount) || 0),
      );
  const cats = [...totals.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = cats.slice(0, 6);
  const rest = cats.slice(6).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push(["Other", rest]);
  const catMax = Math.max(1, ...top.map(([, v]) => v));
  const catSum = top.reduce((s, [, v]) => s + v, 0) || 1;

  const W = 560,
    H = 220,
    padL = 44,
    padB = 30,
    padT = 10;
  const max = Math.max(1, ...last.flatMap((p) => [p.due, p.paid]));
  const gw = (W - padL - 8) / Math.max(last.length, 1);
  const bw = Math.min(22, gw / 2.6);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);

  return (
    <section className="dashboard-card">
      <div className="dashboard-card-head">
        <div>
          <h2>Trends</h2>
          <p>
            Combined Maintenance + Corp Fund collections against charges due,
            with actual expenses shown separately.
          </p>
        </div>
      </div>
      <div className="chart-grid">
        <figure className="chart">
          <figcaption>Due vs collected (last {last.length} months)</figcaption>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Bar chart of amount due and collected per month"
          >
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line
                  x1={padL}
                  x2={W}
                  y1={y(max * t)}
                  y2={y(max * t)}
                  stroke="#e2e8f0"
                />
                <text
                  x={padL - 6}
                  y={y(max * t) + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748b"
                >
                  {short(max * t)}
                </text>
              </g>
            ))}
            {last.map((p, i) => {
              const cx = padL + gw * i + gw / 2;
              const due = p.due,
                paid = p.paid;
              return (
                <g key={p.month}>
                  <title>
                    {label(p.month)}: due {inr(due)}, collected {inr(paid)}
                  </title>
                  <rect
                    x={cx - bw - 1}
                    y={y(due)}
                    width={bw}
                    height={H - padB - y(due)}
                    rx="3"
                    fill="#86EFAC"
                  />
                  <rect
                    x={cx + 1}
                    y={y(paid)}
                    width={bw}
                    height={H - padB - y(paid)}
                    rx="3"
                    fill="#16a34a"
                  />
                  <text
                    x={cx}
                    y={H - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#475569"
                  >
                    {label(p.month).replace(" 20", " ’")}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="chart-legend">
            <span>
              <i style={{ background: "#86EFAC" }} /> Due
            </span>
            <span>
              <i style={{ background: "#16a34a" }} /> Collected
            </span>
          </div>
        </figure>

        <figure className="chart">
          <figcaption>Expenses by category (selected period)</figcaption>
          {top.length === 0 ? (
            <p className="muted">No expenses recorded yet.</p>
          ) : (
            <ul className="hbars">
              {top.map(([name, v]) => (
                <li key={name} title={`${name}: ${inr(v)}`}>
                  <span className="hb-name">{name}</span>
                  <span className="hb-track">
                    <span
                      className="hb-fill"
                      style={{ width: `${(v / catMax) * 100}%` }}
                    />
                  </span>
                  <span className="hb-val">
                    {inr(v)} <small>{Math.round((v / catSum) * 100)}%</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </figure>
      </div>
    </section>
  );
}
