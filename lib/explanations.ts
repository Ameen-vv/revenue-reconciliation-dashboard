import type { DiscrepancyType } from "@/lib/types";
import type { LlmExplanation } from "@/lib/summary";

/**
 * Static per-type explanations.
 *
 * These are the fallback when the model is unreachable or returns something
 * that does not validate. They are deliberately generic where the model would
 * be specific: the tool stays useful without the LLM, and the UI marks these
 * as a fallback so nobody mistakes a canned line for an analysis of their
 * particular row.
 */
export const STATIC_EXPLANATIONS: Record<DiscrepancyType, LlmExplanation> = {
  missing_payment: {
    likely_cause:
      "The order was marked completed in the store but the charge was never created, or it was created against a different reference the processor export does not carry.",
    recommended_action:
      "Confirm whether the customer was ever charged. If not, either collect the amount or void the order so it stops being reported as revenue.",
    confidence: "medium",
  },
  orphan_payment: {
    likely_cause:
      "Money was taken against an order reference that does not exist in the order export, usually a deleted order, a manual charge, or an export that covers a different date range.",
    recommended_action:
      "Trace the transaction in the processor and identify what it was for. Unattributed income cannot be recognised and may need refunding.",
    confidence: "medium",
  },
  amount_mismatch: {
    likely_cause:
      "The amount charged differs from the order's net total, typically because a discount, tax or shipping change was applied on one side only.",
    recommended_action:
      "Compare the order's discount against what the processor captured, then refund the excess or invoice the shortfall.",
    confidence: "medium",
  },
  duplicate_payment: {
    likely_cause:
      "The same amount settled more than once for one order, usually a retried checkout or a webhook processed twice.",
    recommended_action:
      "Refund the surplus charge promptly. Duplicate charges are the most common source of customer-initiated chargebacks.",
    confidence: "high",
  },
  currency_mismatch: {
    likely_cause:
      "The order and the payment are denominated in different currencies, so the two amounts describe different sums of money.",
    recommended_action:
      "Establish which currency the customer was actually charged in and at what rate before deciding whether any amount is owed. Do not net these figures against each other.",
    confidence: "high",
  },
  status_conflict: {
    likely_cause:
      "The order's lifecycle status and the money that actually moved disagree — a cancelled or refunded order still holding funds, or a completed order that was refunded in full.",
    recommended_action:
      "Decide which system is right, then correct the other. Funds held against a cancelled order are a chargeback waiting to happen.",
    confidence: "high",
  },
  rounding_variance: {
    likely_cause:
      "A one or two cent difference between the expected and settled amount, consistent with rounding at some point in the pricing or capture path.",
    recommended_action:
      "No action needed per order. If the pattern is widespread, find the rounding step and make it consistent.",
    confidence: "high",
  },
  unsettled_payment: {
    likely_cause:
      "A charge exists but never settled — it failed, or it is still pending with the processor.",
    recommended_action:
      "Retry or recover the payment. Until it settles this order is not revenue, however the order system reports it.",
    confidence: "high",
  },
  timing_anomaly: {
    likely_cause:
      "The charge settled far outside the normal window after the order was placed, suggesting a delayed capture or a backfilled record.",
    recommended_action:
      "Check whether the customer was charged when they expected to be. Very late captures are frequently disputed.",
    confidence: "medium",
  },
  incomplete_record: {
    likely_cause:
      "A required field is empty on one side of the pair. The money may reconcile, but the record is not complete.",
    recommended_action:
      "Backfill the missing field from the source system. Missing customer or timestamp data blocks invoicing and audit.",
    confidence: "high",
  },
};

/** Returns the static fallback for a type, tagged so the UI can say so. */
export function fallbackExplanation(type: DiscrepancyType): LlmExplanation {
  return { ...STATIC_EXPLANATIONS[type], fallback: true };
}
