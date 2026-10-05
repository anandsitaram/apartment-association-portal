// Server-authoritative financial calculations used for persisted/archive data.
// The per-flat maths (maintOf / corpOf / rounding) is the same code the web and native apps run: shared/lib.ts.
import { snapshotOf as frozenSnapshot } from "../shared/lib.js";
import type { Row } from "./types";

const num = (v: unknown): number =>
  Number.isFinite(Number(v)) ? Number(v) : 0;

/** The billing basis is refreshed from the submitted expense rows on an explicit recalculation.
 * This deliberately ignores an old persisted zero so older months can be repaired by recalculating.
 */
export function expenseTotalForRecalculation(
  expenses: unknown,
  suppliedTotal: unknown,
  recalculate: boolean,
): number {
  const currentTotal = (Array.isArray(expenses) ? expenses : []).reduce(
    (sum: number, expense: Row) => sum + num(expense?.amount),
    0,
  );
  return recalculate
    ? currentTotal
    : suppliedTotal == null
      ? currentTotal
      : num(suppliedTotal);
}

export function snapshotOf(
  month: string,
  m: Row | undefined,
  flats: Row[] | undefined,
  payments: Row[] | undefined,
  isBlocks = false,
) {
  const s = frozenSnapshot(
    (flats || []) as any[],
    { ...(m || {}), month } as any,
    (payments || []) as any[],
    isBlocks,
  );
  return {
    ...s,
    // descriptions are stored truncated (the snapshot lives in a settings row)
    expenses: s.expenses.map((e) => ({
      ...e,
      description: String(e?.description ?? "").slice(0, 60),
      amount: e.amount,
    })),
  };
}
