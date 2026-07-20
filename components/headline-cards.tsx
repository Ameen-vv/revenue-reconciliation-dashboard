import { formatDollars } from "@/lib/money";
import type { Summary } from "@/lib/summary";

/**
 * The headline band.
 *
 * Structured as one question at a time rather than a wall of equal-weight
 * numbers. "How bad is it" is answered by a single hero figure; the two
 * directions of leakage sit beneath it because they are the two different
 * jobs a person has to do; the volume counts are deliberately the smallest
 * thing on the page, because they are context rather than a call to action.
 */

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink3">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-ink3">{sub}</p>
    </div>
  );
}

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
  } = summary;

  const totalExposure = overchargedCents + Math.abs(underCollectedCents);
  const cleanOrders = ordersCount - summary.disputedOrderCount;
  const cleanPercent = Math.round((cleanOrders / ordersCount) * 100);

  return (
    <div className="space-y-4">
      {/* How bad is it? One number, stated once. */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-ink3">
              Total money involved in discrepancies
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums text-ink">
              {formatDollars(totalExposure)}
            </p>
            <p className="mt-2 text-sm text-ink2">
              across <span className="font-medium">{discrepancyCount}</span>{" "}
              issues affecting{" "}
              <span className="font-medium">{summary.disputedOrderCount}</span>{" "}
              of {ordersCount} orders
              {unquantifiedCount > 0 && (
                <>, plus {unquantifiedCount} that cannot be valued</>
              )}
              .
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm font-medium text-ink3">Reconciled cleanly</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-good">
              {cleanPercent}%
            </p>
            <p className="text-xs text-ink3">
              {formatDollars(reconciledCents)} across {cleanOrders} orders
            </p>
          </div>
        </div>

        {/* Proportion bar: the clean majority against the flagged remainder. */}
        <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-raised">
          <div className="bg-good" style={{ width: `${cleanPercent}%` }} />
          <div className="flex-1 bg-ink3/40" />
        </div>
      </div>

      {/* The two directions. These are two different jobs, so two cards. */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-over/40 bg-over-soft p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-over" />
            <p className="text-sm font-semibold text-ink">Money out the door</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-over">
            {formatDollars(overchargedCents)}
          </p>
          <p className="mt-1 text-sm text-ink2">
            Charged in excess, or received with no order behind it.
            <span className="font-medium text-ink">
              {" "}
              Refund it before the customer disputes it.
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-under/40 bg-under-soft p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-under" />
            <p className="text-sm font-semibold text-ink">
              Money never collected
            </p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-under">
            {formatDollars(Math.abs(underCollectedCents))}
          </p>
          <p className="mt-1 text-sm text-ink2">
            Orders the store counts as revenue but was never paid for.
            <span className="font-medium text-ink"> Chase it.</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Orders"
            value={ordersCount.toLocaleString()}
            sub="after removing duplicates"
          />
          <Stat
            label="Payments"
            value={paymentsCount.toLocaleString()}
            sub="rows from the processor"
          />
          <Stat
            label="Net position"
            value={formatDollars(summary.netAtRiskCents)}
            sub="the two directions nearly cancel — treat them separately"
          />
        </div>
      </div>
    </div>
  );
}
