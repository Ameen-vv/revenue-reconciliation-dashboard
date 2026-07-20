import Link from "next/link";
import DiscrepancyTable from "@/components/discrepancy-table";
import { loadLatestImport, loadDiscrepancyPage } from "@/lib/dashboard-data";
import { PAGE_SIZES, DEFAULT_PAGE_SIZE } from "@/lib/paging";
import { DISCREPANCY_TYPES, type DiscrepancyType } from "@/lib/types";

/** Longest search term accepted, to keep the ILIKE bounded. */
const MAX_QUERY = 80;

/**
 * Every control is URL state, which makes a filtered view shareable and lets
 * the server do the work. All four values are validated here rather than
 * trusted, so a hand-edited query string cannot reach the database.
 */
function parseParams(raw: Record<string, string | string[] | undefined>) {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const pageRaw = Number(one(raw.page));
  const page =
    Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1;

  const sizeRaw = Number(one(raw.size));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeRaw)
    ? sizeRaw
    : DEFAULT_PAGE_SIZE;

  const typeRaw = one(raw.type);
  const type: DiscrepancyType | "all" =
    typeRaw && (DISCREPANCY_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as DiscrepancyType)
      : "all";

  const query = (one(raw.q) ?? "").trim().slice(0, MAX_QUERY);

  return { page, pageSize, type, query };
}

export default async function DiscrepanciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const { page, pageSize, type, query } = parseParams(await searchParams);

  const result = await loadDiscrepancyPage({
    importId: latest.meta.id,
    page,
    pageSize,
    type,
    query,
  });

  return (
    <DiscrepancyTable
      rows={result.rows}
      orders={result.orders}
      payments={result.payments}
      total={result.total}
      unfilteredTotal={result.unfilteredTotal}
      countsByType={result.countsByType}
      page={result.page}
      pageCount={result.pageCount}
      pageSize={pageSize}
      type={type}
      query={query}
    />
  );
}
