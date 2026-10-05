/** Payment status and per-flat dues: the single rule behind every "paid / unpaid / excluded" badge. */
import type { Flat, Month, Payment } from "./types.js";
import { corpOf, maintOf } from "./lib.js";

export type PayStatus = "paid" | "unpaid" | "excluded";

/**
 * Status of one flat for one month. `excluded` flats owe nothing; otherwise a flat is paid once it has
 * paid at least what it owes (half a paisa of slack for rounding) and unpaid until then. There is
 * deliberately no "part paid" state - a flat that has paid less than its dues is unpaid.
 */
export const payStatus = (
  totalDue: number,
  totalPaid: number,
  excluded = false,
): PayStatus =>
  excluded
    ? "excluded"
    : totalDue > 0 && totalPaid - totalDue > -0.005
      ? "paid"
      : "unpaid";

export interface FlatDues {
  due: number;
  cdue: number;
  paid: number;
  cpaid: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
  status: PayStatus;
}

/**
 * Dues for one flat in one month, from the same calculation the web app, the API snapshots and the Excel
 * export use. Corp Fund is only counted when `withCorp` is true (the server sends it to admins only).
 */
export function flatDues(
  month: Month,
  flat: Flat,
  payment: Pick<Payment, "maint" | "corp"> | undefined,
  withCorp: boolean,
  allFlats?: readonly Flat[],
  isBlocks = false,
): FlatDues {
  const due = maintOf(month, flat, allFlats, isBlocks);
  const cdue = withCorp ? corpOf(flat, month) : 0;
  const paid = +(payment?.maint ?? 0) || 0;
  const cpaid = withCorp ? +(payment?.corp ?? 0) || 0 : 0;
  const totalDue = due + cdue;
  const totalPaid = paid + cpaid;
  return {
    due,
    cdue,
    paid,
    cpaid,
    totalDue,
    totalPaid,
    balance: totalDue - totalPaid,
    status: payStatus(totalDue, totalPaid, totalDue <= 0),
  };
}

export function monthTotals(
  month: Month | undefined,
  flats: Flat[],
  payments: Payment[],
  withCorp: boolean,
  isBlocks = false,
) {
  const byFlat = new Map(
    payments.filter((p) => p.month === month?.month).map((p) => [p.flat, p]),
  );
  let due = 0,
    paid = 0,
    unpaidFlats = 0;
  if (month)
    for (const f of flats) {
      const d = flatDues(
        month,
        f,
        byFlat.get(f.flat),
        withCorp,
        flats,
        isBlocks,
      );
      due += d.totalDue;
      paid += d.totalPaid;
      if (d.status === "unpaid") unpaidFlats++;
    }
  return { due, paid, outstanding: due - paid, unpaidFlats };
}
