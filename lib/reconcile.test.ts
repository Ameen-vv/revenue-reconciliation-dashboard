import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { reconcile } from "@/lib/reconcile";
import { parseOrders, parsePayments, normalizeOrderKey } from "@/lib/ingest";
import { toCents } from "@/lib/money";
import type {
  DiscrepancyType,
  NormalizedOrder,
  NormalizedPayment,
} from "@/lib/types";

// --- fixture helpers --------------------------------------------------------

function order(o: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    orderKey: "ORD-1",
    rawOrderId: "ORD-1",
    orderDateRaw: "2025-04-01 00:00:00",
    orderDate: "2025-04-01T00:00:00.000Z",
    customerEmail: "a@example.com",
    currency: "USD",
    grossCents: 10000,
    discountCents: 0,
    netCents: 10000,
    status: "completed",
    missingFields: [],
    ...o,
  };
}

function payment(p: Partial<NormalizedPayment> = {}): NormalizedPayment {
  return {
    transactionRef: "TXN1",
    orderKey: "ORD-1",
    rawOrderReference: "ORD-1",
    processedAtRaw: "01/04/2025 00:00",
    processedAt: "2025-04-01T00:00:00.000Z",
    currency: "USD",
    amountCents: 10000,
    feeCents: 300,
    netSettledCents: 9700,
    type: "charge",
    status: "settled",
    missingFields: [],
    ...p,
  };
}

function typesOf(items: { type: DiscrepancyType }[]): DiscrepancyType[] {
  return items.map((d) => d.type);
}

// --- money ------------------------------------------------------------------

describe("toCents", () => {
  it("converts decimal strings without float error", () => {
    expect(toCents("325.12")).toBe(32512);
    expect(toCents("0.0")).toBe(0);
    expect(toCents("135.39")).toBe(13539);
    expect(toCents("1.005")).toBe(100);
    expect(toCents("210")).toBe(21000);
  });

  it("keeps a blank field distinct from a zero", () => {
    expect(toCents("")).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents("0")).toBe(0);
  });
});

describe("normalizeOrderKey", () => {
  it("repairs the case and whitespace damage in the payment export", () => {
    expect(normalizeOrderKey(" ord-1801 ")).toBe("ORD-1801");
    expect(normalizeOrderKey("ord-1802")).toBe("ORD-1802");
    expect(normalizeOrderKey("")).toBeNull();
  });
});

// --- one fixture per discrepancy class --------------------------------------

describe("reconcile: individual classes", () => {
  it("flags a completed order with no payment at all", () => {
    const result = reconcile([order()], []);
    expect(typesOf(result)).toEqual(["missing_payment"]);
    expect(result[0].deltaCents).toBe(-10000);
  });

  it("does not flag a cancelled order that was never charged", () => {
    expect(reconcile([order({ status: "cancelled" })], [])).toEqual([]);
  });

  it("flags a payment referencing an order that does not exist", () => {
    const result = reconcile([], [payment({ orderKey: "ORD-999" })]);
    expect(typesOf(result)).toEqual(["orphan_payment"]);
    expect(result[0].deltaCents).toBe(10000);
  });

  it("flags a settled amount outside the tolerance", () => {
    const result = reconcile([order()], [payment({ amountCents: 12500 })]);
    expect(typesOf(result)).toEqual(["amount_mismatch"]);
    expect(result[0].deltaCents).toBe(2500);
  });

  it("flags two identical charges as a duplicate, not an amount mismatch", () => {
    const result = reconcile(
      [order()],
      [payment({ transactionRef: "TXN1" }), payment({ transactionRef: "TXN2" })],
    );
    expect(typesOf(result)).toEqual(["duplicate_payment"]);
    expect(result[0].deltaCents).toBe(10000);
    expect(result[0].transactionRefs).toEqual(["TXN1", "TXN2"]);
  });

  it("flags a currency mismatch and refuses to state a delta", () => {
    const result = reconcile([order()], [payment({ currency: "EUR" })]);
    expect(typesOf(result)).toEqual(["currency_mismatch"]);
    expect(result[0].deltaCents).toBeNull();
  });

  it("flags a cancelled order that was charged anyway", () => {
    const result = reconcile([order({ status: "cancelled" })], [payment()]);
    expect(typesOf(result)).toEqual(["status_conflict"]);
    expect(result[0].deltaCents).toBe(10000);
  });

  it("flags a refunded order that was only partly refunded", () => {
    const result = reconcile(
      [order({ status: "refunded" })],
      [
        payment({ transactionRef: "TXN1" }),
        payment({ transactionRef: "TXN2", type: "refund", amountCents: 4000 }),
      ],
    );
    expect(typesOf(result)).toEqual(["status_conflict"]);
    expect(result[0].deltaCents).toBe(6000);
  });

  it("flags a completed order that was refunded in full", () => {
    const result = reconcile(
      [order()],
      [
        payment({ transactionRef: "TXN1" }),
        payment({ transactionRef: "TXN2", type: "refund" }),
      ],
    );
    expect(typesOf(result)).toEqual(["status_conflict"]);
  });

  it("treats a one-cent difference as a rounding variance", () => {
    const result = reconcile([order()], [payment({ amountCents: 10001 })]);
    expect(typesOf(result)).toEqual(["rounding_variance"]);
    expect(result[0].deltaCents).toBe(1);
  });

  it("draws the tolerance line at exactly two cents", () => {
    expect(typesOf(reconcile([order()], [payment({ amountCents: 10002 })]))).toEqual([
      "rounding_variance",
    ]);
    expect(typesOf(reconcile([order()], [payment({ amountCents: 10003 })]))).toEqual([
      "amount_mismatch",
    ]);
  });

  it("flags a payment that never settled without also calling it missing", () => {
    const result = reconcile([order()], [payment({ status: "failed" })]);
    expect(typesOf(result)).toEqual(["unsettled_payment"]);
  });

  it("flags a charge that settled long after the order", () => {
    const result = reconcile(
      [order()],
      [payment({ processedAt: "2025-05-06T00:00:00.000Z" })],
    );
    expect(typesOf(result)).toEqual(["timing_anomaly"]);
  });

  it("does not flag a charge that settled within the window", () => {
    const result = reconcile(
      [order()],
      [payment({ processedAt: "2025-04-03T00:00:00.000Z" })],
    );
    expect(result).toEqual([]);
  });

  it("flags missing fields on either side", () => {
    const fromOrder = reconcile(
      [order({ missingFields: ["customer_email"] })],
      [payment()],
    );
    expect(typesOf(fromOrder)).toEqual(["incomplete_record"]);

    const fromPayment = reconcile(
      [order()],
      [payment({ missingFields: ["processed_at"], processedAt: null })],
    );
    expect(typesOf(fromPayment)).toEqual(["incomplete_record"]);
  });

  it("is repeatable and order-independent", () => {
    const orders = [order({ orderKey: "ORD-A" }), order({ orderKey: "ORD-B" })];
    const payments = [
      payment({ transactionRef: "T1", orderKey: "ORD-A", amountCents: 12500 }),
      payment({ transactionRef: "T2", orderKey: "ORD-B", amountCents: 9000 }),
    ];
    const forwards = reconcile(orders, payments);
    const backwards = reconcile([...orders].reverse(), [...payments].reverse());
    expect(forwards).toEqual(backwards);
  });
});

// --- the real datasets ------------------------------------------------------

function loadRealData() {
  const dir = path.join(process.cwd(), "data");
  const { orders, duplicatesDropped } = parseOrders(
    readFileSync(path.join(dir, "orders.csv"), "utf8"),
  );
  const payments = parsePayments(
    readFileSync(path.join(dir, "payments.csv"), "utf8"),
  );
  return { orders, payments, duplicatesDropped };
}

describe("reconcile: the supplied datasets", () => {
  const { orders, payments, duplicatesDropped } = loadRealData();
  const result = reconcile(orders, payments);

  const counts = result.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1;
    return acc;
  }, {});

  it("ingests the expected volumes", () => {
    // 185 data rows, one of which is an exact duplicate of another.
    expect(orders.length).toBe(184);
    expect(duplicatesDropped).toBe(1);
    expect(payments.length).toBe(187);
  });

  it("parses payment dates as day-first", () => {
    const p = payments.find((p) => p.transactionRef === "TXN700112")!;
    // 02/04/2025 is 2 April, not 4 February.
    expect(p.processedAt?.slice(0, 10)).toBe("2025-04-02");
  });

  it("treats net_amount as gross minus discount on every order row", () => {
    for (const o of orders) {
      expect(o.netCents).toBe(o.grossCents - o.discountCents);
    }
  });

  it("produces the expected discrepancy counts", () => {
    expect(counts).toEqual({
      missing_payment: 4,
      orphan_payment: 3,
      amount_mismatch: 3,
      duplicate_payment: 2,
      currency_mismatch: 2,
      status_conflict: 3,
      rounding_variance: 3,
      unsettled_payment: 2,
      timing_anomaly: 1,
      incomplete_record: 2,
    });
  });

  it("identifies the specific rows behind each class", () => {
    const keysFor = (type: string) =>
      result
        .filter((d) => d.type === type)
        .map((d) => d.orderKey)
        .sort();

    expect(keysFor("missing_payment")).toEqual([
      "ORD-1201",
      "ORD-1202",
      "ORD-1203",
      "ORD-1204",
    ]);
    expect(keysFor("orphan_payment")).toEqual([
      "ORD-1301",
      "ORD-1302",
      "ORD-1303",
    ]);
    expect(keysFor("amount_mismatch")).toEqual([
      "ORD-1401",
      "ORD-1402",
      "ORD-1403",
    ]);
    expect(keysFor("duplicate_payment")).toEqual(["ORD-1501", "ORD-1502"]);
    expect(keysFor("currency_mismatch")).toEqual(["ORD-1601", "ORD-1602"]);
    expect(keysFor("status_conflict")).toEqual([
      "ORD-1701",
      "ORD-1702",
      "ORD-1703",
    ]);
    expect(keysFor("rounding_variance")).toEqual([
      "ORD-1901",
      "ORD-1902",
      "ORD-1903",
    ]);
    expect(keysFor("unsettled_payment")).toEqual(["ORD-2001", "ORD-2002"]);
    expect(keysFor("timing_anomaly")).toEqual(["ORD-2101"]);
    expect(keysFor("incomplete_record")).toEqual(["ORD-2201", "ORD-2202"]);
  });

  it("does not mistake the case-damaged references for problems", () => {
    // " ord-1801 " and "ord-1802" must reconcile cleanly after normalization.
    const noisy = result.filter(
      (d) => d.orderKey === "ORD-1801" || d.orderKey === "ORD-1802",
    );
    expect(noisy).toEqual([]);
  });

  it("reports the amount mismatch deltas exactly", () => {
    const delta = (key: string) =>
      result.find((d) => d.type === "amount_mismatch" && d.orderKey === key)!
        .deltaCents;
    expect(delta("ORD-1401")).toBe(2500);
    expect(delta("ORD-1402")).toBe(-1850);
    expect(delta("ORD-1403")).toBe(6000);
  });
});
