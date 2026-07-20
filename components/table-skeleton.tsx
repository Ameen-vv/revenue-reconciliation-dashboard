/**
 * Placeholder rows shown while a page of discrepancies is being fetched.
 *
 * The shapes deliberately mirror the real row -- chevron, severity chip,
 * title, summary line, the two figures and the delta -- so the layout does not
 * jump when the data lands. Varying the title widths stops the block reading
 * as a solid rectangle.
 */

const TITLE_WIDTHS = ["9rem", "7.5rem", "10.5rem", "8rem", "9.5rem", "7rem"];

function Bar({ w, h = "0.75rem" }: { w: string; h?: string }) {
  return (
    <span
      className="shimmer block rounded"
      style={{ width: w, height: h }}
      aria-hidden="true"
    />
  );
}

export default function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul
      className="divide-y divide-line"
      aria-busy="true"
      aria-label="Loading discrepancies"
    >
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-4">
          <Bar w="1rem" h="1rem" />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Bar w="3.5rem" h="1rem" />
              <Bar w={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
              <Bar w="4.5rem" />
            </div>
            <Bar w="60%" h="0.7rem" />
          </div>

          <div className="hidden shrink-0 space-y-1.5 sm:block">
            <Bar w="5rem" h="0.7rem" />
            <Bar w="5rem" h="0.7rem" />
          </div>

          <div className="w-28 shrink-0 space-y-1.5">
            <Bar w="4rem" h="1rem" />
            <Bar w="3rem" h="0.7rem" />
          </div>
        </li>
      ))}
    </ul>
  );
}
