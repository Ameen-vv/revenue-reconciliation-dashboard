import Link from "next/link";
import {
  DISCREPANCY_LABELS,
  DISCREPANCY_ACTIONS,
  DISCREPANCY_SUMMARIES,
} from "@/lib/types";
import { severityRank } from "@/lib/reconcile";
import { formatDollars } from "@/lib/money";
import type { TypeExposure } from "@/lib/summary";

/**
 * The work list: every problem type, in the order it should be dealt with.
 *
 * Ordered by severity, not by money. An earlier version ranked on amount and
 * showed the top four, which silently dropped duplicate charges -- the single
 * highest-severity class -- because they happened to be the fifth largest
 * number. Cost of ignoring, not size, is what decides what to do first.
 *
 * Money shown here is the same total the chart draws for that type, so the two
 * panels can never disagree.
 */
export default function PriorityList({
  exposure,
}: {
  exposure: TypeExposure[];
}) {
  const items = [...exposure].sort(
    (a, b) => severityRank(a.type) - severityRank(b.type),
  );

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line p-5">
        <h2 className="text-sm font-semibold text-ink">
          What to fix, in order
        </h2>
        <p className="mt-0.5 text-xs text-ink3">
          Ranked by what it costs to leave alone, not by size. Select a row to
          see the individual cases.
        </p>
      </div>

      <ol className="divide-y divide-line">
        {items.map((item, index) => (
          <li key={item.type}>
            <Link
              href={`/dashboard/discrepancies?type=${item.type}`}
              className="flex items-center gap-4 px-5 py-3 hover:bg-raised"
            >
              <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-ink3">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {DISCREPANCY_ACTIONS[item.type]}
                </p>
                <p className="truncate text-xs text-ink3">
                  {item.count} × {DISCREPANCY_LABELS[item.type].toLowerCase()} —{" "}
                  {DISCREPANCY_SUMMARIES[item.type].toLowerCase()}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {item.totalCents > 0 ? (
                  <>
                    <p className="text-sm font-semibold tabular-nums text-ink">
                      {formatDollars(item.totalCents)}
                    </p>
                    <p className="text-[11px] text-ink3">
                      {item.outCents > 0 && item.underCents > 0
                        ? `${formatDollars(item.outCents)} out · ${formatDollars(item.underCents)} uncollected`
                        : item.outCents > 0
                          ? "out the door"
                          : "never collected"}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-ink3">no dollar value</p>
                )}
              </div>

              <span aria-hidden="true" className="shrink-0 text-ink3">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
