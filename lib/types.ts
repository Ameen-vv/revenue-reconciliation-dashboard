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
