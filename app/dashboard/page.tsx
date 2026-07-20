import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";
import ImportPanel from "@/components/import-panel";
import HeadlineCards from "@/components/headline-cards";
import RiskChart from "@/components/risk-chart";
import DiscrepancyTable from "@/components/discrepancy-table";
import { summarize, riskByType } from "@/lib/summary";
import type { DiscrepancyRow, OrderRow, PaymentRow } from "@/lib/summary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already gates this route; this is the second line of
  // defence and gives us a typed, non-null user below.
  if (!user) redirect("/login");

  // Every select below relies on RLS for the user scoping. There is no
  // user_id filter in application code, so a policy regression fails closed
  // rather than leaking another user's rows.
  const { data: latestImport } = await supabase
    .from("imports")
    .select("id, created_at, orders_count, payments_count, duplicates_dropped")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestImport) {
    return (
      <Shell email={user.email}>
        <ImportPanel hasData={false} />
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h2 className="text-lg font-medium text-slate-900">Nothing imported yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Load the sample dataset above, or upload your own order and payment
            exports, to see where the two systems disagree.
          </p>
        </section>
      </Shell>
    );
  }

  const [{ data: discrepancies }, { data: orders }, { data: payments }] =
    await Promise.all([
      supabase
        .from("discrepancies")
        .select(
          "id, type, severity, order_key, transaction_refs, expected_cents, actual_cents, delta_cents, detail, llm_explanation",
        )
        .eq("import_id", latestImport.id),
      supabase
        .from("orders")
        .select(
          "order_key, raw_order_id, order_date_raw, order_date, customer_email, currency, gross_cents, discount_cents, net_cents, status",
        )
        .eq("import_id", latestImport.id),
      supabase
        .from("payments")
        .select(
          "transaction_ref, order_key, raw_order_reference, processed_at_raw, processed_at, currency, amount_cents, fee_cents, net_settled_cents, type, status",
        )
        .eq("import_id", latestImport.id),
    ]);

  const discrepancyRows = (discrepancies ?? []) as DiscrepancyRow[];
  const orderRows = (orders ?? []) as OrderRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];

  const summary = summarize(
    discrepancyRows,
    orderRows,
    latestImport.orders_count,
    latestImport.payments_count,
  );

  // Only the rows the drill-down can actually reach are indexed, so the client
  // receives the detail it needs without shipping the whole dataset.
  const referencedKeys = new Set(
    discrepancyRows.map((d) => d.order_key).filter((k): k is string => k != null),
  );
  const referencedRefs = new Set(discrepancyRows.flatMap((d) => d.transaction_refs));

  const ordersByKey: Record<string, OrderRow> = {};
  for (const o of orderRows) {
    if (referencedKeys.has(o.order_key)) ordersByKey[o.order_key] = o;
  }

  const paymentsByRef: Record<string, PaymentRow> = {};
  for (const p of paymentRows) {
    if (referencedRefs.has(p.transaction_ref)) paymentsByRef[p.transaction_ref] = p;
  }

  const chartData = riskByType(discrepancyRows);

  return (
    <Shell email={user.email}>
      <ImportPanel hasData />

      <p className="text-sm text-slate-500">
        Import of {new Date(latestImport.created_at).toLocaleString()} —{" "}
        {latestImport.orders_count} orders, {latestImport.payments_count} payments
        {latestImport.duplicates_dropped > 0 &&
          `, ${latestImport.duplicates_dropped} duplicate order row dropped`}
        .
      </p>

      <HeadlineCards summary={summary} />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Value at risk by discrepancy type
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Bars right of the line are money that left the business or arrived
          unattributed. Bars left of it are revenue that was never banked.
        </p>
        <div className="mt-4">
          <RiskChart data={chartData} />
        </div>
      </section>

      <DiscrepancyTable
        discrepancies={discrepancyRows}
        orders={ordersByKey}
        payments={paymentsByRef}
      />
    </Shell>
  );
}

function Shell({
  email,
  children,
}: {
  email?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Reconciliation Dashboard
            </h1>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
          <SignOutButton />
        </header>
        {children}
      </div>
    </main>
  );
}
