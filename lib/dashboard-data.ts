import { createClient } from "@/lib/supabase/server";
import type { DiscrepancyRow, OrderRow, PaymentRow } from "@/lib/summary";
import type { DiscrepancyType } from "@/lib/types";
export { PAGE_SIZES, DEFAULT_PAGE_SIZE } from "@/lib/paging";

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

export type DiscrepancyQuery = {
  importId: string;
  page: number;
  pageSize: number;
  type: DiscrepancyType | "all";
  query: string;
};

export type DiscrepancyPage = {
  rows: DiscrepancyRow[];
  /** Rows matching the current filter, across all pages. */
  total: number;
  /** Rows in the import, ignoring the filter. */
  unfilteredTotal: number;
  countsByType: { type: DiscrepancyType; count: number }[];
  page: number;
  pageCount: number;
  orders: Record<string, OrderRow>;
  payments: Record<string, PaymentRow>;
};

/**
 * Fetches one page of discrepancies, filtered and sorted by Postgres.
 *
 * Filtering, searching, ordering and slicing all happen in the database. An
 * earlier version shipped every row to the browser and paged there, which cost
 * ~1.8 KB per discrepancy on every load -- fine at 25 rows, roughly 18 MB at
 * 10,000. Only the rows actually on screen now cross the wire, along with just
 * the order and payment records those rows drill into.
 */
export async function loadDiscrepancyPage({
  importId,
  page,
  pageSize,
  type,
  query,
}: DiscrepancyQuery): Promise<DiscrepancyPage> {
  const supabase = await createClient();

  const base = () => {
    let q = supabase
      .from("discrepancies")
      .select(
        "id, type, severity, order_key, transaction_refs, expected_cents, actual_cents, delta_cents, detail, llm_explanation",
        { count: "exact" },
      )
      .eq("import_id", importId);

    if (type !== "all") q = q.eq("type", type);
    if (query) {
      // The wildcards are the only interpolation; PostgREST parameterises the
      // value, and % / _ inside the term are escaped so a user typing "%"
      // cannot widen their own match.
      const escaped = query.replace(/[%_\\]/g, (c) => `\\${c}`);
      q = q.ilike("search_text", `%${escaped.toLowerCase()}%`);
    }
    return q;
  };

  // Ask for the page the caller wants, but clamp it once the count is known
  // so a stale ?page= deep link lands on the last real page, not an empty one.
  const first = await base()
    .order("severity_rank", { ascending: true })
    .order("abs_delta_cents", { ascending: false })
    .order("order_key", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  let rows = (first.data ?? []) as DiscrepancyRow[];
  let currentPage = page;

  if (page > pageCount) {
    currentPage = pageCount;
    const retry = await base()
      .order("severity_rank", { ascending: true })
      .order("abs_delta_cents", { ascending: false })
      .order("order_key", { ascending: true })
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
    rows = (retry.data ?? []) as DiscrepancyRow[];
  }

  // Counts for the filter dropdown and the unfiltered total, as one grouped
  // query rather than ten count round-trips.
  const { data: counts } = await supabase.rpc("discrepancy_type_counts", {
    p_import_id: importId,
  });

  const countsByType = ((counts ?? []) as { type: string; n: number }[]).map(
    (c) => ({ type: c.type as DiscrepancyType, count: Number(c.n) }),
  );
  const unfilteredTotal = countsByType.reduce((sum, c) => sum + c.count, 0);

  // Drill-down detail for this page only.
  const keys = [
    ...new Set(rows.map((r) => r.order_key).filter((k): k is string => !!k)),
  ];
  const refs = [...new Set(rows.flatMap((r) => r.transaction_refs))];

  const [ordersResult, paymentsResult] = await Promise.all([
    keys.length
      ? supabase
          .from("orders")
          .select(
            "order_key, raw_order_id, order_date_raw, order_date, customer_email, currency, gross_cents, discount_cents, net_cents, status",
          )
          .eq("import_id", importId)
          .in("order_key", keys)
      : Promise.resolve({ data: [] as OrderRow[] }),
    refs.length
      ? supabase
          .from("payments")
          .select(
            "transaction_ref, order_key, raw_order_reference, processed_at_raw, processed_at, currency, amount_cents, fee_cents, net_settled_cents, type, status",
          )
          .eq("import_id", importId)
          .in("transaction_ref", refs)
      : Promise.resolve({ data: [] as PaymentRow[] }),
  ]);

  const orders: Record<string, OrderRow> = {};
  for (const o of (ordersResult.data ?? []) as OrderRow[]) {
    orders[o.order_key] = o;
  }
  const payments: Record<string, PaymentRow> = {};
  for (const p of (paymentsResult.data ?? []) as PaymentRow[]) {
    payments[p.transaction_ref] = p;
  }

  return {
    rows,
    total,
    unfilteredTotal,
    countsByType,
    page: currentPage,
    pageCount,
    orders,
    payments,
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
