import type {
  Discrepancy,
  DiscrepancyType,
  NormalizedOrder,
  NormalizedPayment,
  Severity,
} from "@/lib/types";
import { formatCents } from "@/lib/money";

/**
 * The reconciliation engine.
 *
 * `reconcile` is a pure function: same input, same output, always. It performs
 * no I/O, reads no clock, and contains no randomness, which is what makes the
 * result reproducible and the whole thing testable against fixtures. An LLM is
 * never consulted here -- the explanation layer runs strictly downstream of
 * these results and cannot influence them.
 */

/**
 * Amounts within this many cents of the expected charge are treated as a
 * rounding variance rather than a real mismatch.
 *
 * The tolerance is absolute, not a percentage. A 0.5% band would forgive a
 * $2.50 error on a $500 order while flagging a $0.15 error on a $20 one, which
 * is exactly backwards: the size of a processor's rounding error does not
 * scale with the order. Two cents covers half-cent rounding applied twice and
 * nothing else.
 */
export const ROUNDING_TOLERANCE_CENTS = 2;

/**
 * A settled charge landing more than this many days after the order is treated
 * as a timing anomaly.
 *
 * Authorisations normally settle within a day or two; a week is generous
 * enough that ordinary batch delays and weekends do not trip it, while still
 * catching a charge that was captured weeks late -- by which point the
 * customer may well dispute it.
 */
export const TIMING_THRESHOLD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Severity ranking, lowest number first, used as the dashboard's default sort.
 *
 * The ordering is by how much it costs to leave the row alone. Duplicate
 * charges and status conflicts are cash that has already left the building and
 * carry chargeback risk, so they lead. Missing and orphaned payments are
 * revenue that is unaccounted for in one direction or the other. Rounding and
 * incompleteness are hygiene, and sit at the bottom where they cannot bury a
 * real problem.
 */
const SEVERITY_RANK: Record<DiscrepancyType, number> = {
  duplicate_payment: 0,
  status_conflict: 1,
  missing_payment: 2,
  orphan_payment: 3,
  currency_mismatch: 4,
  amount_mismatch: 5,
  unsettled_payment: 6,
  timing_anomaly: 7,
  rounding_variance: 8,
  incomplete_record: 9,
};

const SEVERITY_OF: Record<DiscrepancyType, Severity> = {
  duplicate_payment: "critical",
  status_conflict: "critical",
  missing_payment: "high",
  orphan_payment: "high",
  currency_mismatch: "high",
  amount_mismatch: "high",
  unsettled_payment: "medium",
  timing_anomaly: "low",
  rounding_variance: "info",
  incomplete_record: "info",
};

export function severityRank(type: DiscrepancyType): number {
  return SEVERITY_RANK[type];
}

function isSettledCharge(p: NormalizedPayment): boolean {
  return p.type === "charge" && p.status === "settled";
}

function isSettledRefund(p: NormalizedPayment): boolean {
  return p.type === "refund" && p.status === "settled";
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Matches orders against payments and returns every disagreement found.
 *
 * Matching is exact-key only, on the normalized order key. There is
 * deliberately no fuzzy fallback on customer email plus a similar amount: with
 * repeat customers and round numbers that manufactures confident-looking
 * matches that are simply wrong, and a reconciliation tool that invents links
 * is worse than one that admits it cannot find them.
 */
export function reconcile(
  orders: NormalizedOrder[],
  payments: NormalizedPayment[],
): Discrepancy[] {
  const found: Discrepancy[] = [];

  const ordersByKey = new Map<string, NormalizedOrder>();
  for (const order of orders) ordersByKey.set(order.orderKey, order);

  const paymentsByKey = new Map<string, NormalizedPayment[]>();
  for (const payment of payments) {
    // A payment with no usable reference cannot be attributed to anything.
    if (!payment.orderKey || !ordersByKey.has(payment.orderKey)) continue;
    const bucket = paymentsByKey.get(payment.orderKey);
    if (bucket) bucket.push(payment);
    else paymentsByKey.set(payment.orderKey, [payment]);
  }

  // --- Payments that point at no order we know about -----------------------
  for (const payment of payments) {
    if (payment.orderKey && ordersByKey.has(payment.orderKey)) continue;
    found.push({
      type: "orphan_payment",
      severity: SEVERITY_OF.orphan_payment,
      orderKey: payment.orderKey,
      transactionRefs: [payment.transactionRef],
      expectedCents: null,
      actualCents: payment.amountCents,
      deltaCents: payment.amountCents,
      detail: payment.orderKey
        ? `Payment references ${payment.orderKey}, which does not exist in the order export.`
        : "Payment carries no order reference at all.",
    });
  }

  // --- Everything anchored on an order -------------------------------------
  for (const order of orders) {
    const related = paymentsByKey.get(order.orderKey) ?? [];
    const settledCharges = related.filter(isSettledCharge);
    const settledRefunds = related.filter(isSettledRefund);
    const unsettled = related.filter((p) => p.status !== "settled");

    const chargedCents = sum(settledCharges.map((p) => p.amountCents));
    const refundedCents = sum(settledRefunds.map((p) => p.amountCents));
    // Refunds are netted against charges rather than tracked separately, which
    // makes a partial refund fall out as a smaller settled amount instead of
    // needing a class of its own.
    const netSettledCents = chargedCents - refundedCents;

    const expectedCents = order.netCents;

    // These suppress the generic amount comparison further down. Each of them
    // already explains the amount difference in full, and reporting both would
    // double-count the same dollars in "value at risk".
    let currencyConflict = false;
    let statusConflict = false;
    let duplicateCharge = false;

    // --- No payment at all -------------------------------------------------
    if (related.length === 0) {
      if (order.status === "completed") {
        found.push({
          type: "missing_payment",
          severity: SEVERITY_OF.missing_payment,
          orderKey: order.orderKey,
          transactionRefs: [],
          expectedCents,
          actualCents: 0,
          deltaCents: -expectedCents,
          detail: `Order is marked completed but no payment of any kind references it. ${formatCents(
            expectedCents,
          )} was never collected.`,
        });
      }
      // A cancelled order with no payment is the system working correctly.
    }

    // --- Payments that never settled ---------------------------------------
    if (unsettled.length > 0) {
      const statuses = [...new Set(unsettled.map((p) => p.status ?? "unknown"))];
      found.push({
        type: "unsettled_payment",
        severity: SEVERITY_OF.unsettled_payment,
        orderKey: order.orderKey,
        transactionRefs: unsettled.map((p) => p.transactionRef),
        expectedCents,
        actualCents: netSettledCents,
        deltaCents: netSettledCents - expectedCents,
        detail: `Order has ${unsettled.length} payment(s) with status ${statuses.join(
          ", ",
        )}. Nothing has settled for this amount, so the revenue is not banked.`,
      });
    }

    // --- Currency ----------------------------------------------------------
    const mismatchedCurrency = related.filter(
      (p) => p.currency && order.currency && p.currency !== order.currency,
    );
    if (mismatchedCurrency.length > 0) {
      currencyConflict = true;
      const currencies = [...new Set(mismatchedCurrency.map((p) => p.currency))];
      found.push({
        type: "currency_mismatch",
        severity: SEVERITY_OF.currency_mismatch,
        orderKey: order.orderKey,
        transactionRefs: mismatchedCurrency.map((p) => p.transactionRef),
        expectedCents,
        actualCents: null,
        // Left null on purpose. No FX conversion is attempted anywhere in
        // this engine: without a rate source, as of the right moment, any
        // converted figure would be a guess presented as a reconciled result.
        deltaCents: null,
        detail: `Order is denominated in ${order.currency} but was charged in ${currencies.join(
          ", ",
        )}. The amounts cannot be compared without an exchange rate, so no delta is claimed.`,
      });
    }

    // --- Status conflicts --------------------------------------------------
    if (order.status === "cancelled" && netSettledCents > 0) {
      statusConflict = true;
      found.push({
        type: "status_conflict",
        severity: SEVERITY_OF.status_conflict,
        orderKey: order.orderKey,
        transactionRefs: related.map((p) => p.transactionRef),
        expectedCents: 0,
        actualCents: netSettledCents,
        deltaCents: netSettledCents,
        detail: `Order is cancelled but ${formatCents(
          netSettledCents,
        )} is still held. The customer has been charged for something the store believes it did not sell.`,
      });
    } else if (order.status === "refunded" && netSettledCents > 0) {
      statusConflict = true;
      found.push({
        type: "status_conflict",
        severity: SEVERITY_OF.status_conflict,
        orderKey: order.orderKey,
        transactionRefs: related.map((p) => p.transactionRef),
        expectedCents: 0,
        actualCents: netSettledCents,
        deltaCents: netSettledCents,
        detail: `Order is marked refunded but only ${formatCents(
          refundedCents,
        )} of ${formatCents(chargedCents)} was returned, leaving ${formatCents(
          netSettledCents,
        )} still held.`,
      });
    } else if (
      order.status === "completed" &&
      settledRefunds.length > 0 &&
      netSettledCents <= 0
    ) {
      statusConflict = true;
      found.push({
        type: "status_conflict",
        severity: SEVERITY_OF.status_conflict,
        orderKey: order.orderKey,
        transactionRefs: related.map((p) => p.transactionRef),
        expectedCents,
        actualCents: netSettledCents,
        deltaCents: netSettledCents - expectedCents,
        detail: `Order is still marked completed but has been refunded in full (${formatCents(
          refundedCents,
        )}). Revenue is being reported for an order the customer no longer paid for.`,
      });
    }

    // --- Duplicate charges -------------------------------------------------
    const chargeGroups = new Map<string, NormalizedPayment[]>();
    for (const charge of settledCharges) {
      const signature = `${charge.currency}:${charge.amountCents}`;
      const bucket = chargeGroups.get(signature);
      if (bucket) bucket.push(charge);
      else chargeGroups.set(signature, [charge]);
    }
    const duplicated = [...chargeGroups.values()].filter((g) => g.length > 1);
    if (duplicated.length > 0) {
      duplicateCharge = true;
      const refs = duplicated.flatMap((g) => g.map((p) => p.transactionRef));
      const extraCents = sum(
        duplicated.map((g) => g[0].amountCents * (g.length - 1)),
      );
      found.push({
        type: "duplicate_payment",
        severity: SEVERITY_OF.duplicate_payment,
        orderKey: order.orderKey,
        transactionRefs: refs,
        expectedCents,
        actualCents: chargedCents,
        deltaCents: extraCents,
        detail: `The same amount was charged ${
          duplicated[0].length
        } times for this order. ${formatCents(
          extraCents,
        )} was taken in excess and is a refund the customer has not asked for yet.`,
      });
    }

    // --- Amount comparison -------------------------------------------------
    // Only reached when nothing above already accounts for the difference.
    if (
      !currencyConflict &&
      !statusConflict &&
      !duplicateCharge &&
      settledCharges.length > 0
    ) {
      const deltaCents = netSettledCents - expectedCents;
      if (deltaCents !== 0) {
        const withinTolerance =
          Math.abs(deltaCents) <= ROUNDING_TOLERANCE_CENTS;
        const type: DiscrepancyType = withinTolerance
          ? "rounding_variance"
          : "amount_mismatch";
        found.push({
          type,
          severity: SEVERITY_OF[type],
          orderKey: order.orderKey,
          transactionRefs: settledCharges.map((p) => p.transactionRef),
          expectedCents,
          actualCents: netSettledCents,
          deltaCents,
          detail: withinTolerance
            ? `Settled ${formatCents(
                Math.abs(deltaCents),
              )} ${deltaCents > 0 ? "above" : "below"} the expected amount, within the ${ROUNDING_TOLERANCE_CENTS}-cent rounding tolerance.`
            : `Expected ${formatCents(expectedCents)} but ${formatCents(
                netSettledCents,
              )} settled, a difference of ${formatCents(deltaCents)}.`,
        });
      }
    }

    // --- Timing ------------------------------------------------------------
    if (order.orderDate) {
      const orderTime = new Date(order.orderDate).getTime();
      const late = settledCharges.filter((p) => {
        if (!p.processedAt) return false;
        const gapDays = (new Date(p.processedAt).getTime() - orderTime) / DAY_MS;
        return Math.abs(gapDays) > TIMING_THRESHOLD_DAYS;
      });
      if (late.length > 0) {
        const gaps = late.map((p) =>
          Math.round(
            (new Date(p.processedAt!).getTime() - orderTime) / DAY_MS,
          ),
        );
        const worst = gaps.reduce((a, b) =>
          Math.abs(b) > Math.abs(a) ? b : a,
        );
        found.push({
          type: "timing_anomaly",
          severity: SEVERITY_OF.timing_anomaly,
          orderKey: order.orderKey,
          transactionRefs: late.map((p) => p.transactionRef),
          expectedCents,
          actualCents: netSettledCents,
          deltaCents: 0,
          detail:
            worst > 0
              ? `Charge settled ${worst} days after the order was placed, well beyond the ${TIMING_THRESHOLD_DAYS}-day settlement window.`
              : `Charge settled ${Math.abs(worst)} days before the order was placed, which should not be possible.`,
        });
      }
    }

    // --- Data quality ------------------------------------------------------
    if (order.missingFields.length > 0) {
      found.push({
        type: "incomplete_record",
        severity: SEVERITY_OF.incomplete_record,
        orderKey: order.orderKey,
        transactionRefs: [],
        expectedCents,
        actualCents: netSettledCents,
        deltaCents: null,
        detail: `Order row is missing ${order.missingFields.join(
          ", ",
        )}. The money reconciles, but the record cannot support invoicing or customer contact.`,
      });
    }

    for (const payment of related) {
      if (payment.missingFields.length === 0) continue;
      found.push({
        type: "incomplete_record",
        severity: SEVERITY_OF.incomplete_record,
        orderKey: order.orderKey,
        transactionRefs: [payment.transactionRef],
        expectedCents,
        actualCents: netSettledCents,
        deltaCents: null,
        detail: `Payment ${payment.transactionRef} is missing ${payment.missingFields.join(
          ", ",
        )}. The amount is correct but the row cannot be placed on a timeline.`,
      });
    }
  }

  return sortDiscrepancies(found);
}

/**
 * Default ordering: worst class first, then biggest money first inside a class.
 * Ties break on the order key so the output is stable regardless of input
 * ordering, which matters for the repeatability guarantee.
 */
export function sortDiscrepancies(items: Discrepancy[]): Discrepancy[] {
  return [...items].sort((a, b) => {
    const byRank = SEVERITY_RANK[a.type] - SEVERITY_RANK[b.type];
    if (byRank !== 0) return byRank;

    const byDelta =
      Math.abs(b.deltaCents ?? 0) - Math.abs(a.deltaCents ?? 0);
    if (byDelta !== 0) return byDelta;

    return (a.orderKey ?? "").localeCompare(b.orderKey ?? "");
  });
}
