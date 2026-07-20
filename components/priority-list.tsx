import Link from "next/link";
import {
  DISCREPANCY_LABELS,
  DISCREPANCY_ACTIONS,
  type DiscrepancyType,
} from "@/lib/types";
import { formatDollars } from "@/lib/money";
import type { DiscrepancyRow } from "@/lib/summary";

/**
 * The "which ones first" answer.
 *
 * A list of every discrepancy sorted by severity is still a list of 25 things.
 * This collapses them into the handful of decisions a person actually has to
 * make today, each with the money attached and the action spelled out.
 */
export default function PriorityList({
  discrepancies,
}: {
  discrepancies: DiscrepancyRow[];
}) {
  const groups = new Map<
    DiscrepancyType,
    { count: number; cents: number; keys: string[] }
  >();

  for (const d of discrepancies) {
    const g = groups.get(d.type) ?? { count: 0, cents: 0, keys: [] };
    g.count += 1;
    g.cents += Math.abs(d.delta_cents ?? 0);
    if (d.order_key) g.keys.push(d.order_key);
    groups.set(d.type, g);
  }

  // Only the classes that represent money or risk needing a decision. Rounding
  // noise and incomplete fields are real findings but they are not today's
  // work, and putting them here would dilute the word "priority".
  const actionable: DiscrepancyType[] = [
    "duplicate_payment",
    "status_conflict",
    "missing_payment",
    "orphan_payment",
    "amount_mismatch",
    "unsettled_payment",
  ];

  const items = actionable
    .filter((type) => groups.has(type))
    .map((type) => ({ type, ...groups.get(type)! }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 4);

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Start here</h2>
      <p className="mt-0.5 text-xs text-ink3">
        The decisions worth making first, biggest money at the top. Each opens
        the matching rows.
      </p>

      <ol className="mt-4 space-y-2">
        {items.map((item, index) => (
          <li key={item.type}>
            <Link
              href={`/dashboard/discrepancies?type=${item.type}`}
              className="flex items-center gap-4 rounded-lg border border-line px-4 py-3 hover:bg-raised"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-canvas">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {DISCREPANCY_ACTIONS[item.type]}
                </p>
                <p className="truncate text-xs text-ink3">
                  {item.count} × {DISCREPANCY_LABELS[item.type].toLowerCase()}
                  {item.keys.length > 0 &&
                    ` — ${item.keys.slice(0, 4).join(", ")}`}
                  {item.keys.length > 4 && ` +${item.keys.length - 4} more`}
                </p>
              </div>

              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {formatDollars(item.cents)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
