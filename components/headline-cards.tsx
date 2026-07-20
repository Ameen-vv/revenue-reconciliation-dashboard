import { formatDollars } from "@/lib/money";
import type { Summary } from "@/lib/summary";

/**
 * The headline.
 *
 * One figure, then the single split that changes what you do about it. An
 * earlier version showed seven numbers of equal weight including a "net
 * position" that summed the two directions -- a figure that read as "$49.73,
 * nothing to see" while nearly $1,000 sat in each direction. A number nobody
 * should act on does not belong on the page at all.
 */
export default function HeadlineCards({
  summary,
  unquantifiedCount,
}: {
  summary: Summary;
  unquantifiedCount: number;
}) {
  const {
    ordersCount,
    paymentsCount,
    discrepancyCount,
    reconciledCents,
    overchargedCents,
    underCollectedCents,
    disputedOrderCount,
  } = summary;

  const under = Math.abs(underCollectedCents);
  const total = overchargedCents + under;
  const cleanOrders = ordersCount - disputedOrderCount;
  const cleanPercent = Math.round((cleanOrders / ordersCount) * 100);

  // Relative widths of the two directions inside one bar, so the split is
  // readable at a glance without comparing two separate numbers.
  const outPercent = total === 0 ? 0 : Math.round((overchargedCents / total) * 100);

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <p className="text-sm font-medium text-ink3">Money at risk</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums text-ink">
        {formatDollars(total)}
      </p>
      <p className="mt-2 max-w-2xl text-sm text-ink2">
        Found in {discrepancyCount} issues across {disputedOrderCount} of{" "}
        {ordersCount} orders, checked against {paymentsCount} payments.
        {unquantifiedCount > 0 && (
          <>
            {" "}
            A further {unquantifiedCount} issues carry no dollar value because
            the amounts are not comparable.
          </>
        )}
      </p>

      {/* The split that decides what you do: give it back, or go and get it. */}
      <div className="mt-6">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <div className="bg-over" style={{ width: `${outPercent}%` }} />
          <div className="flex-1 bg-under" />
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-over" />
            <div>
              <p className="text-lg font-semibold tabular-nums text-ink">
                {formatDollars(overchargedCents)}
              </p>
              <p className="text-sm font-medium text-ink">
                is money you owe back
              </p>
              <p className="text-xs text-ink3">
                Charged in excess or taken with no order behind it. Refund it
                before the customer disputes it.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm bg-under" />
            <div>
              <p className="text-lg font-semibold tabular-nums text-ink">
                {formatDollars(under)}
              </p>
              <p className="text-sm font-medium text-ink">
                is money you are owed
              </p>
              <p className="text-xs text-ink3">
                Orders counted as revenue that were never actually paid for.
                Collect it or write it off.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink3">
        The other {cleanPercent}% of orders reconciled cleanly —{" "}
        {formatDollars(reconciledCents)} across {cleanOrders} orders matched
        their payments exactly.
      </p>
    </section>
  );
}
