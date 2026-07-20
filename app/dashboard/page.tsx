import Link from "next/link";
import ImportPanel from "@/components/import-panel";
import HeadlineCards from "@/components/headline-cards";
import RiskChart from "@/components/risk-chart";
import PriorityList from "@/components/priority-list";
import { summarize, riskByType } from "@/lib/summary";
import { loadLatestImport } from "@/lib/dashboard-data";

export default async function OverviewPage() {
  const latest = await loadLatestImport();

  if (!latest) {
    return (
      <>
        <section className="rounded-xl border border-line bg-surface p-10 text-center">
          <h2 className="text-lg font-semibold text-ink">
            Start by importing two exports
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink2">
            One from the order system — what the store believes it sold — and
            one from the payment processor — what actually got charged,
            refunded or settled. Every order is matched to its payments, and
            each way the two disagree is classified and priced.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-xs text-ink3">
            Nothing is sent to a third party during this step, and the files
            themselves are not stored.
          </p>
        </section>
        <ImportPanel hasData={false} />
      </>
    );
  }

  const { meta, discrepancies, orders } = latest;
  const summary = summarize(
    discrepancies,
    orders,
    meta.orders_count,
    meta.payments_count,
  );
  const unquantifiedCount = discrepancies.filter(
    (d) => d.delta_cents == null,
  ).length;

  return (
    <>
      <HeadlineCards summary={summary} unquantifiedCount={unquantifiedCount} />

      <PriorityList discrepancies={discrepancies} />

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">
          Where the money is, by problem type
        </h2>
        <p className="mt-1 text-xs text-ink3">
          Bars to the right are money that left the business or arrived with no
          order behind it. Bars to the left are revenue that was never banked.
        </p>
        <div className="mt-4">
          <RiskChart data={riskByType(discrepancies)} />
        </div>
      </section>

      <div className="flex justify-center">
        <Link
          href="/dashboard/discrepancies"
          className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-canvas hover:opacity-90"
        >
          Examine all {discrepancies.length} discrepancies →
        </Link>
      </div>

      <details className="rounded-xl border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Import details
        </summary>
        <p className="mt-2 text-sm text-ink2">
          Imported {new Date(meta.created_at).toLocaleString()} —{" "}
          {meta.orders_count} orders and {meta.payments_count} payments
          {meta.duplicates_dropped > 0 &&
            `, after dropping ${meta.duplicates_dropped} exact-duplicate order row`}
          .
        </p>
        <div className="mt-4">
          <ImportPanel hasData />
        </div>
      </details>
    </>
  );
}
