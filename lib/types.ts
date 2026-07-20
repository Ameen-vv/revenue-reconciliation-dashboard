/** Shared shapes for the ingestion pipeline and the reconciliation engine. */

/** A normalized order row, as the engine sees it. */
export type NormalizedOrder = {
  orderKey: string;
  rawOrderId: string;
  orderDateRaw: string | null;
  /** ISO string, or null when the source date could not be parsed. */
  orderDate: string | null;
  customerEmail: string | null;
  currency: string | null;
  grossCents: number;
  discountCents: number;
  netCents: number;
  status: string | null;
  /** Fields that were blank in the source row, kept for incomplete_record. */
  missingFields: string[];
};

/** A normalized payment row, as the engine sees it. */
export type NormalizedPayment = {
  transactionRef: string;
  /** Normalized (trim + uppercase) join key, or null when absent. */
  orderKey: string | null;
  rawOrderReference: string | null;
  processedAtRaw: string | null;
  processedAt: string | null;
  currency: string | null;
  amountCents: number;
  feeCents: number;
  netSettledCents: number;
  type: string | null;
  status: string | null;
  missingFields: string[];
};

export const DISCREPANCY_TYPES = [
  "missing_payment",
  "orphan_payment",
  "amount_mismatch",
  "duplicate_payment",
  "currency_mismatch",
  "status_conflict",
  "rounding_variance",
  "unsettled_payment",
  "timing_anomaly",
  "incomplete_record",
] as const;

export type DiscrepancyType = (typeof DISCREPANCY_TYPES)[number];

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Discrepancy = {
  type: DiscrepancyType;
  severity: Severity;
  /** The order this concerns; null only for an orphan payment's own key. */
  orderKey: string | null;
  transactionRefs: string[];
  /** What the order system said should be charged, in cents. */
  expectedCents: number | null;
  /** What the processor actually settled, in cents. */
  actualCents: number | null;
  /** actual - expected. Positive means overcharged, negative means underbilled. */
  deltaCents: number | null;
  detail: string;
};

/** Human-readable labels used in the UI and in LLM prompts. */
export const DISCREPANCY_LABELS: Record<DiscrepancyType, string> = {
  missing_payment: "Missing payment",
  orphan_payment: "Orphan payment",
  amount_mismatch: "Amount mismatch",
  duplicate_payment: "Duplicate payment",
  currency_mismatch: "Currency mismatch",
  status_conflict: "Status conflict",
  rounding_variance: "Rounding variance",
  unsettled_payment: "Unsettled payment",
  timing_anomaly: "Timing anomaly",
  incomplete_record: "Incomplete record",
};

/**
 * One plain sentence per class, shown next to the label everywhere it appears.
 *
 * The type names are internal jargon. Nobody reading a dashboard for the first
 * time knows what an "orphan payment" is, and a column of unexplained
 * technical labels is what turns a report into a puzzle.
 */
export const DISCREPANCY_SUMMARIES: Record<DiscrepancyType, string> = {
  missing_payment: "Order was completed but the customer was never charged",
  orphan_payment: "Money was received for an order that does not exist",
  amount_mismatch: "The amount charged is not the amount that was owed",
  duplicate_payment: "The customer was charged more than once",
  currency_mismatch: "The order and the payment use different currencies",
  status_conflict: "The order status and the money that moved disagree",
  rounding_variance: "Off by a cent or two — rounding, not a real error",
  unsettled_payment: "A charge exists but the money never arrived",
  timing_anomaly: "The charge landed far later than the order was placed",
  incomplete_record: "The amounts are right but a required field is blank",
};

/** What a user is actually supposed to do about each class. */
export const DISCREPANCY_ACTIONS: Record<DiscrepancyType, string> = {
  missing_payment: "Collect it or void the order",
  orphan_payment: "Trace it, then attribute or refund",
  amount_mismatch: "Refund the excess or invoice the shortfall",
  duplicate_payment: "Refund the extra charge now",
  currency_mismatch: "Confirm what the customer was actually charged",
  status_conflict: "Decide which system is right and correct the other",
  rounding_variance: "No action per order; fix the pattern if it spreads",
  unsettled_payment: "Retry or recover the payment",
  timing_anomaly: "Check the customer was charged when they expected",
  incomplete_record: "Backfill the missing field",
};
