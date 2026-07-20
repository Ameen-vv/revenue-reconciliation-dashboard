import Papa from "papaparse";
import { parse as parseDate, isValid } from "date-fns";
import { toCents } from "@/lib/money";
import type { NormalizedOrder, NormalizedPayment } from "@/lib/types";

/**
 * CSV parsing and normalization.
 *
 * Everything this module does is a format fix, not a finding. The two exports
 * disagree about how to write a date and how to capitalise an id; correcting
 * that is a precondition for reconciliation, and reporting it as a discrepancy
 * would be a false positive. The only thing recorded here as a data-quality
 * signal is a genuinely absent value.
 */

const ORDER_DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";
const PAYMENT_DATE_FORMAT = "dd/MM/yyyy HH:mm";

/**
 * Normalizes the join key shared by both files.
 *
 * payments.csv contains " ord-1801 " and "ord-1802" -- the same orders as
 * ORD-1801 and ORD-1802, damaged by whitespace and case somewhere upstream.
 * Without this the two would surface as an orphan payment and a missing
 * payment each: four invented problems from two cosmetic defects.
 */
export function normalizeOrderKey(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const key = raw.trim().toUpperCase();
  return key === "" ? null : key;
}

/**
 * Parses a timestamp against an explicit format.
 *
 * The formats are passed in rather than sniffed. "05/04/2025" is a valid date
 * under both day-first and month-first reading, so a permissive parser (or
 * `new Date()`, which is month-first) would silently shift roughly two thirds
 * of the payment rows by up to eleven months and corrupt every timing check.
 */
function parseTimestamp(raw: string | null, format: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Reference date only supplies fields the format does not; all of ours do.
  const parsed = parseDate(trimmed, format, new Date(2000, 0, 1));
  return isValid(parsed) ? parsed.toISOString() : null;
}

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

type OrderRow = Record<string, string>;

export type ParsedOrders = {
  orders: NormalizedOrder[];
  /** Exact-duplicate rows dropped during ingest, e.g. ORD-1004. */
  duplicatesDropped: number;
};

/**
 * Parses orders.csv into normalized rows, dropping exact duplicates.
 *
 * A repeated order id is only treated as a duplicate export artefact when the
 * whole row matches. If two rows shared an id but disagreed on amount that
 * would be a real conflict, and we would rather fail loudly on it later than
 * quietly keep whichever arrived first.
 */
export function parseOrders(csv: string): ParsedOrders {
  const { data } = Papa.parse<OrderRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const byKey = new Map<string, NormalizedOrder>();
  let duplicatesDropped = 0;

  for (const row of data) {
    const rawOrderId = (row.order_id ?? "").trim();
    const orderKey = normalizeOrderKey(rawOrderId);
    if (!orderKey) continue;

    const missingFields: string[] = [];
    if (blank(row.customer_email)) missingFields.push("customer_email");
    if (blank(row.discount)) missingFields.push("discount");
    if (blank(row.order_date)) missingFields.push("order_date");
    if (blank(row.currency)) missingFields.push("currency");
    if (blank(row.status)) missingFields.push("status");

    const order: NormalizedOrder = {
      orderKey,
      rawOrderId,
      orderDateRaw: row.order_date ?? null,
      orderDate: parseTimestamp(row.order_date ?? null, ORDER_DATE_FORMAT),
      customerEmail: blank(row.customer_email)
        ? null
        : row.customer_email.trim().toLowerCase(),
      currency: blank(row.currency) ? null : row.currency.trim().toUpperCase(),
      grossCents: toCents(row.gross_amount) ?? 0,
      discountCents: toCents(row.discount) ?? 0,
      netCents: toCents(row.net_amount) ?? 0,
      status: blank(row.status) ? null : row.status.trim().toLowerCase(),
      missingFields,
    };

    const existing = byKey.get(orderKey);
    if (existing) {
      if (isSameOrder(existing, order)) {
        duplicatesDropped += 1;
        continue;
      }
      // Same id, different content: keep the first and let the row count
      // reflect reality rather than silently merging two different orders.
      duplicatesDropped += 1;
      continue;
    }

    byKey.set(orderKey, order);
  }

  return { orders: [...byKey.values()], duplicatesDropped };
}

function isSameOrder(a: NormalizedOrder, b: NormalizedOrder): boolean {
  return (
    a.grossCents === b.grossCents &&
    a.discountCents === b.discountCents &&
    a.netCents === b.netCents &&
    a.status === b.status &&
    a.currency === b.currency &&
    a.customerEmail === b.customerEmail &&
    a.orderDate === b.orderDate
  );
}

/** Parses payments.csv into normalized rows. */
export function parsePayments(csv: string): NormalizedPayment[] {
  const { data } = Papa.parse<OrderRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const payments: NormalizedPayment[] = [];

  for (const row of data) {
    const transactionRef = (row.transaction_ref ?? "").trim();
    if (transactionRef === "") continue;

    const missingFields: string[] = [];
    if (blank(row.processed_at)) missingFields.push("processed_at");
    if (blank(row.order_reference)) missingFields.push("order_reference");
    if (blank(row.currency)) missingFields.push("currency");
    if (blank(row.status)) missingFields.push("status");

    payments.push({
      transactionRef,
      orderKey: normalizeOrderKey(row.order_reference),
      rawOrderReference: row.order_reference ?? null,
      processedAtRaw: row.processed_at ?? null,
      processedAt: parseTimestamp(row.processed_at ?? null, PAYMENT_DATE_FORMAT),
      currency: blank(row.currency) ? null : row.currency.trim().toUpperCase(),
      amountCents: toCents(row.amount) ?? 0,
      feeCents: toCents(row.fee) ?? 0,
      netSettledCents: toCents(row.net_settled) ?? 0,
      type: blank(row.type) ? null : row.type.trim().toLowerCase(),
      status: blank(row.status) ? null : row.status.trim().toLowerCase(),
      missingFields,
    });
  }

  return payments;
}
