import { createClient } from "@/lib/supabase/server";
import type { DiscrepancyRow, OrderRow, PaymentRow } from "@/lib/summary";

/**
 * Loads the most recent import and everything hanging off it.
 *
 * Shared by the overview and the discrepancies page so the two can never
 * disagree about which import they are describing. Every select relies on RLS
 * for user scoping rather than a `user_id` filter in application code, so a
 * policy regression fails closed instead of leaking.
 */
export type ImportMeta = {
  id: string;
  created_at: string;
  orders_count: number;
  payments_count: number;
  duplicates_dropped: number;
};

export type LatestImport = {
  meta: ImportMeta;
  discrepancies: DiscrepancyRow[];
  orders: OrderRow[];
  payments: PaymentRow[];
};

export async function loadLatestImport(): Promise<LatestImport | null> {
  const supabase = await createClient();

  const { data: meta } = await supabase
    .from("imports")
    .select("id, created_at, orders_count, payments_count, duplicates_dropped")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ImportMeta>();

  if (!meta) return null;

  const [{ data: discrepancies }, { data: orders }, { data: payments }] =
    await Promise.all([
      supabase
        .from("discrepancies")
        .select(
          "id, type, severity, order_key, transaction_refs, expected_cents, actual_cents, delta_cents, detail, llm_explanation",
        )
        .eq("import_id", meta.id),
      supabase
        .from("orders")
        .select(
          "order_key, raw_order_id, order_date_raw, order_date, customer_email, currency, gross_cents, discount_cents, net_cents, status",
        )
        .eq("import_id", meta.id),
      supabase
        .from("payments")
        .select(
          "transaction_ref, order_key, raw_order_reference, processed_at_raw, processed_at, currency, amount_cents, fee_cents, net_settled_cents, type, status",
        )
        .eq("import_id", meta.id),
    ]);

  return {
    meta,
    discrepancies: (discrepancies ?? []) as DiscrepancyRow[],
    orders: (orders ?? []) as OrderRow[],
    payments: (payments ?? []) as PaymentRow[],
  };
}

/**
 * Indexes only the rows a drill-down can actually reach, so the client gets
 * the detail it needs without shipping the entire dataset.
 */
export function indexForDrilldown(
  discrepancies: DiscrepancyRow[],
  orders: OrderRow[],
  payments: PaymentRow[],
) {
  const keys = new Set(
    discrepancies.map((d) => d.order_key).filter((k): k is string => k != null),
  );
  const refs = new Set(discrepancies.flatMap((d) => d.transaction_refs));

  const ordersByKey: Record<string, OrderRow> = {};
  for (const o of orders) {
    if (keys.has(o.order_key)) ordersByKey[o.order_key] = o;
  }

  const paymentsByRef: Record<string, PaymentRow> = {};
  for (const p of payments) {
    if (refs.has(p.transaction_ref)) paymentsByRef[p.transaction_ref] = p;
  }

  return { ordersByKey, paymentsByRef };
}
