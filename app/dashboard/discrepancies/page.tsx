import Link from "next/link";
import DiscrepancyTable from "@/components/discrepancy-table";
import { loadLatestImport, indexForDrilldown } from "@/lib/dashboard-data";
import { DISCREPANCY_TYPES, type DiscrepancyType } from "@/lib/types";

export default async function DiscrepanciesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const latest = await loadLatestImport();

  if (!latest) {
    return (
      <section className="rounded-xl border border-line bg-surface p-10 text-center">
        <h2 className="text-lg font-semibold text-ink">Nothing to show yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink2">
          Import a pair of exports first and every discrepancy will be listed
          here.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-canvas"
        >
          Go to import
        </Link>
      </section>
    );
  }

  const { discrepancies, orders, payments } = latest;
  const { ordersByKey, paymentsByRef } = indexForDrilldown(
    discrepancies,
    orders,
    payments,
  );

  // A type can be deep-linked from the overview. Validated against the known
  // set so an arbitrary query string cannot reach the client as a filter.
  const requested = (await searchParams).type;
  const initialType =
    requested && (DISCREPANCY_TYPES as readonly string[]).includes(requested)
      ? (requested as DiscrepancyType)
      : "all";

  return (
    <DiscrepancyTable
      discrepancies={discrepancies}
      orders={ordersByKey}
      payments={paymentsByRef}
      initialType={initialType}
    />
  );
}
