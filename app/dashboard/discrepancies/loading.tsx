import TableSkeleton from "@/components/table-skeleton";
import { DEFAULT_PAGE_SIZE } from "@/lib/paging";

/**
 * Shown while the first page of results is being fetched on navigation.
 *
 * The chrome around the list is drawn for real rather than shimmered, so the
 * card does not resize when the rows arrive. Refetches triggered by the
 * filters are handled inside the table itself, which keeps its controls live.
 */
export default function Loading() {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-ink">
              Every discrepancy, worst first
            </h2>
            <p className="mt-0.5 text-xs text-ink3">
              Click any row to see the order and payment records side by side.
            </p>
          </div>
          <div className="shimmer h-8 w-56 rounded-md" aria-hidden="true" />
          <div className="shimmer h-8 w-40 rounded-md" aria-hidden="true" />
        </div>
      </div>

      <TableSkeleton rows={DEFAULT_PAGE_SIZE} />

      <div className="flex items-center gap-3 border-t border-line px-5 py-3">
        <div className="shimmer h-4 w-40 rounded" aria-hidden="true" />
        <div className="shimmer ml-auto h-7 w-52 rounded-md" aria-hidden="true" />
      </div>
    </section>
  );
}
