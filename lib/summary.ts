import type { DiscrepancyType } from "@/lib/types";

/** A discrepancy as stored and as handed to the client components. */
export type DiscrepancyRow = {
  id: string;
  type: DiscrepancyType;
  severity: string;
  order_key: string | null;
  transaction_refs: string[];
  expected_cents: number | null;
  actual_cents: number | null;
  delta_cents: number | null;
  detail: string;
  llm_explanation: LlmExplanation | null;
};

export type LlmExplanation = {
  likely_cause: string;
  recommended_action: string;
  confidence: "high" | "medium" | "low";
  /** True when the model failed and a static fallback was served instead. */
  fallback?: boolean;
};

export type OrderRow = {
  order_key: string;
  raw_order_id: string;
  order_date_raw: string | null;
  order_date: string | null;
  customer_email: string | null;
  currency: string | null;
  gross_cents: number;
  discount_cents: number;
  net_cents: number;
  status: string | null;
};

export type PaymentRow = {
  transaction_ref: string;
  order_key: string | null;
  raw_order_reference: string | null;
  processed_at_raw: string | null;
  processed_at: string | null;
  currency: string | null;
  amount_cents: number;
  fee_cents: number;
  net_settled_cents: number;
  type: string | null;
  status: string | null;
};

export type Summary = {
  ordersCount: number;
  paymentsCount: number;
  discrepancyCount: number;
  /** Order value with no discrepancy attached to it at all. */
  reconciledCents: number;
  /** Order value touched by at least one discrepancy. */
  disputedCents: number;
  /** How many orders carry at least one discrepancy. */
  disputedOrderCount: number;
  /** Money taken in excess or received without an order. */
  overchargedCents: number;
  /** Revenue the store believes it earned but never banked. Negative. */
  underCollectedCents: number;
  /** The signed total of the two above. */
  netAtRiskCents: number;
};

/**
 * Rolls the stored rows up into the headline figures.
 *
 * "Value at risk" is deliberately reported in both directions rather than as a
 * single net number. The two failure modes have opposite remedies -- money
 * taken in excess has to be refunded before the customer disputes it, money
 * never collected has to be chased -- and a net figure lets one silently
 * cancel the other. On the supplied dataset the two are within $50 of each
 * other, which would make a net-only headline read as "nothing is wrong".
 */
export function summarize(
  discrepancies: DiscrepancyRow[],
  orders: Pick<OrderRow, "order_key" | "net_cents">[],
  ordersCount: number,
  paymentsCount: number,
): Summary {
  const flaggedKeys = new Set(
    discrepancies.map((d) => d.order_key).filter((k): k is string => k != null),
  );

  let disputedCents = 0;
  let cleanCents = 0;
  let disputedOrderCount = 0;
  for (const order of orders) {
    if (flaggedKeys.has(order.order_key)) {
      disputedCents += order.net_cents;
      disputedOrderCount += 1;
    } else {
      cleanCents += order.net_cents;
    }
  }

  let overchargedCents = 0;
  let underCollectedCents = 0;
  for (const d of discrepancies) {
    // A currency mismatch carries no delta on purpose; it must not be counted
    // as zero exposure, but nor can it be quantified. It is surfaced by count.
    if (d.delta_cents == null) continue;
    if (d.delta_cents > 0) overchargedCents += d.delta_cents;
    else underCollectedCents += d.delta_cents;
  }

  return {
    ordersCount,
    paymentsCount,
    discrepancyCount: discrepancies.length,
    reconciledCents: cleanCents,
    disputedCents,
    disputedOrderCount,
    overchargedCents,
    underCollectedCents,
    netAtRiskCents: overchargedCents + underCollectedCents,
  };
}

export type TypeExposure = {
  type: DiscrepancyType;
  /** Money taken in excess or received unattributed. Always >= 0. */
  outCents: number;
  /** Money owed but never banked. Always >= 0. */
  underCents: number;
  /** outCents + underCents. The real size of the problem. */
  totalCents: number;
  count: number;
  /** Orders behind this type, for the drill-down link. */
  keys: string[];
};

/**
 * Exposure per type, split by direction and never netted.
 *
 * The two directions are kept apart rather than summed. Netting inside a type
 * is actively misleading: the three status conflicts are +175, +120 and -99,
 * which net to 196 and make it look like a $196 problem when it is really
 * $295 owed back to customers and $99 never collected. Summing them also made
 * this figure disagree with the same type's total elsewhere on the page.
 */
export function riskByType(discrepancies: DiscrepancyRow[]): TypeExposure[] {
  const totals = new Map<DiscrepancyType, TypeExposure>();

  for (const d of discrepancies) {
    const entry =
      totals.get(d.type) ??
      ({
        type: d.type,
        outCents: 0,
        underCents: 0,
        totalCents: 0,
        count: 0,
        keys: [],
      } satisfies TypeExposure);

    const delta = d.delta_cents ?? 0;
    if (delta > 0) entry.outCents += delta;
    else entry.underCents += Math.abs(delta);
    entry.totalCents = entry.outCents + entry.underCents;
    entry.count += 1;
    if (d.order_key) entry.keys.push(d.order_key);

    totals.set(d.type, entry);
  }

  return [...totals.values()].sort((a, b) => b.totalCents - a.totalCents);
}
