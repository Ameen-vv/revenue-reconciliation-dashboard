import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { parseOrders, parsePayments } from "@/lib/ingest";
import { reconcile } from "@/lib/reconcile";
import type { NormalizedOrder, NormalizedPayment } from "@/lib/types";

/**
 * Ingests both datasets, reconciles them, and stores the result.
 *
 * Everything written by one call is tagged with a fresh import_id. A repeated
 * call therefore produces a second, independent import rather than doubling
 * the rows of the first, which is what makes an accidental double-click
 * harmless. The dashboard always reads the most recent import.
 *
 * The uploaded CSVs are parsed and discarded; only normalized rows are stored.
 */

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

async function readSampleCsvs() {
  const dir = path.join(process.cwd(), "data");
  const [orders, payments] = await Promise.all([
    readFile(path.join(dir, "orders.csv"), "utf8"),
    readFile(path.join(dir, "payments.csv"), "utf8"),
  ]);
  return { ordersCsv: orders, paymentsCsv: payments, source: "sample" };
}

/**
 * Accepts either an uploaded pair of CSVs or, with no files attached, falls
 * back to the bundled sample dataset.
 */
async function resolveInput(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return readSampleCsvs();
  }

  const form = await request.formData();
  const ordersFile = form.get("orders");
  const paymentsFile = form.get("payments");

  if (!(ordersFile instanceof File) || !(paymentsFile instanceof File)) {
    return readSampleCsvs();
  }

  if (
    ordersFile.size > MAX_UPLOAD_BYTES ||
    paymentsFile.size > MAX_UPLOAD_BYTES
  ) {
    throw new Error("Each file must be under 5 MB.");
  }

  return {
    ordersCsv: await ordersFile.text(),
    paymentsCsv: await paymentsFile.text(),
    source: "upload",
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already rejects anonymous callers; this keeps the route
  // correct on its own terms and narrows the type of user.id below.
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ordersCsv: string;
  let paymentsCsv: string;
  let source: string;

  try {
    ({ ordersCsv, paymentsCsv, source } = await resolveInput(request));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unreadable upload." },
      { status: 400 },
    );
  }

  let orders: NormalizedOrder[];
  let payments: NormalizedPayment[];
  let duplicatesDropped: number;

  try {
    ({ orders, duplicatesDropped } = parseOrders(ordersCsv));
    payments = parsePayments(paymentsCsv);
  } catch {
    return NextResponse.json(
      { error: "The files could not be parsed as CSV." },
      { status: 400 },
    );
  }

  if (orders.length === 0 || payments.length === 0) {
    return NextResponse.json(
      {
        error:
          "Parsed zero rows from one of the files. Check that the expected column headers are present.",
      },
      { status: 400 },
    );
  }

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({
      user_id: user.id,
      source,
      orders_count: orders.length,
      payments_count: payments.length,
      duplicates_dropped: duplicatesDropped,
    })
    .select("id")
    .single();

  if (importError || !importRow) {
    return NextResponse.json(
      { error: importError?.message ?? "Could not create the import." },
      { status: 500 },
    );
  }

  const importId = importRow.id as string;

  // If any of the three writes below fails, the import row is removed so the
  // dashboard never reads a half-populated import as if it were complete.
  const rollback = async (message: string, status = 500) => {
    await supabase.from("imports").delete().eq("id", importId);
    return NextResponse.json({ error: message }, { status });
  };

  const { error: ordersError } = await supabase.from("orders").insert(
    orders.map((o) => ({
      import_id: importId,
      user_id: user.id,
      order_key: o.orderKey,
      raw_order_id: o.rawOrderId,
      order_date_raw: o.orderDateRaw,
      order_date: o.orderDate,
      customer_email: o.customerEmail,
      currency: o.currency,
      gross_cents: o.grossCents,
      discount_cents: o.discountCents,
      net_cents: o.netCents,
      status: o.status,
    })),
  );
  if (ordersError) return rollback(ordersError.message);

  const { error: paymentsError } = await supabase.from("payments").insert(
    payments.map((p) => ({
      import_id: importId,
      user_id: user.id,
      transaction_ref: p.transactionRef,
      order_key: p.orderKey,
      raw_order_reference: p.rawOrderReference,
      processed_at_raw: p.processedAtRaw,
      processed_at: p.processedAt,
      currency: p.currency,
      amount_cents: p.amountCents,
      fee_cents: p.feeCents,
      net_settled_cents: p.netSettledCents,
      type: p.type,
      status: p.status,
    })),
  );
  if (paymentsError) return rollback(paymentsError.message);

  const discrepancies = reconcile(orders, payments);

  if (discrepancies.length > 0) {
    const { error: discrepancyError } = await supabase
      .from("discrepancies")
      .insert(
        discrepancies.map((d) => ({
          import_id: importId,
          user_id: user.id,
          type: d.type,
          severity: d.severity,
          order_key: d.orderKey,
          transaction_refs: d.transactionRefs,
          expected_cents: d.expectedCents,
          actual_cents: d.actualCents,
          delta_cents: d.deltaCents,
          detail: d.detail,
        })),
      );
    if (discrepancyError) return rollback(discrepancyError.message);
  }

  return NextResponse.json({
    importId,
    source,
    ordersCount: orders.length,
    paymentsCount: payments.length,
    duplicatesDropped,
    discrepancyCount: discrepancies.length,
  });
}
