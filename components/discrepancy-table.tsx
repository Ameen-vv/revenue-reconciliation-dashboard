"use client";

import { useMemo, useState } from "react";
import {
  DISCREPANCY_LABELS,
  DISCREPANCY_SUMMARIES,
  DISCREPANCY_ACTIONS,
  type DiscrepancyType,
} from "@/lib/types";
import { severityRank } from "@/lib/reconcile";
import { formatCents, formatDollars } from "@/lib/money";
import type { DiscrepancyRow, OrderRow, PaymentRow } from "@/lib/summary";
import ExplainPanel from "@/components/explain-panel";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-over/20 text-over",
  high: "bg-over/10 text-over",
  medium: "bg-warn/15 text-warn",
  low: "bg-raised text-ink2",
  info: "bg-raised text-ink3",
};

/**
 * Signed money, with the direction spelled out in words.
 *
 * A bare "+128.74" in red requires the reader to already know the sign
 * convention. Saying "out the door" and "uncollected" means they do not.
 */
function Delta({ cents }: { cents: number | null }) {
  if (cents == null) {
    return (
      <div className="text-right">
        <span className="text-ink3">n/a</span>
        <p className="text-[11px] text-ink3">not comparable</p>
      </div>
    );
  }
  if (cents === 0) {
    return (
      <div className="text-right">
        <span className="text-ink3">—</span>
        <p className="text-[11px] text-ink3">amount is correct</p>
      </div>
    );
  }
  const out = cents > 0;
  return (
    <div className="text-right">
      <span
        className={`font-semibold tabular-nums ${out ? "text-over" : "text-under"}`}
      >
        {formatDollars(Math.abs(cents))}
      </span>
      <p className={`text-[11px] ${out ? "text-over" : "text-under"}`}>
        {out ? "out the door" : "uncollected"}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <dt className="text-ink3">{label}</dt>
      <dd
        className={
          highlight
            ? "rounded bg-over-soft px-1.5 font-semibold text-over"
            : "text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-ink3 transition-transform ${
        open ? "rotate-90" : ""
      }`}
      fill="currentColor"
    >
      <path d="M7.5 4.5 13 10l-5.5 5.5-1.4-1.4L10.2 10 6.1 5.9z" />
    </svg>
  );
}

export default function DiscrepancyTable({
  discrepancies,
  orders,
  payments,
  initialType = "all",
}: {
  discrepancies: DiscrepancyRow[];
  orders: Record<string, OrderRow>;
  payments: Record<string, PaymentRow>;
  /** Pre-applied filter, set when arriving from a "Start here" link. */
  initialType?: DiscrepancyType | "all";
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DiscrepancyType | "all">(
    initialType,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(8);
  const [page, setPage] = useState(1);

  const presentTypes = useMemo(() => {
    const counts = new Map<DiscrepancyType, number>();
    for (const d of discrepancies)
      counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
    return [...counts.entries()].sort(
      (a, b) => severityRank(a[0]) - severityRank(b[0]),
    );
  }, [discrepancies]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return discrepancies
      .filter((d) => typeFilter === "all" || d.type === typeFilter)
      .filter((d) => {
        if (!needle) return true;
        return (
          (d.order_key ?? "").toLowerCase().includes(needle) ||
          d.transaction_refs.some((r) => r.toLowerCase().includes(needle)) ||
          DISCREPANCY_LABELS[d.type].toLowerCase().includes(needle) ||
          DISCREPANCY_SUMMARIES[d.type].toLowerCase().includes(needle) ||
          d.detail.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        // Worst class first, then biggest money inside a class -- the same
        // ordering the engine applies, so the table always opens on the rows
        // that cost the most to ignore.
        const byRank = severityRank(a.type) - severityRank(b.type);
        if (byRank !== 0) return byRank;
        const byDelta =
          Math.abs(b.delta_cents ?? 0) - Math.abs(a.delta_cents ?? 0);
        if (byDelta !== 0) return byDelta;
        return (a.order_key ?? "").localeCompare(b.order_key ?? "");
      });
  }, [discrepancies, query, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // Clamp rather than store a corrected page in state: narrowing the filter
  // while on page 3 would otherwise render an empty list until a second
  // render corrected it.
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  function resetPaging() {
    setPage(1);
    setExpanded(null);
  }

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

          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPaging();
            }}
            placeholder="Search order or transaction…"
            className="w-56 rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:border-ink"
          />

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as DiscrepancyType | "all");
              resetPaging();
            }}
            className="rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:border-ink"
          >
            <option value="all">All types ({discrepancies.length})</option>
            {presentTypes.map(([type, count]) => (
              <option key={type} value={type}>
                {DISCREPANCY_LABELS[type]} ({count})
              </option>
            ))}
          </select>
        </div>

        {/* The row count lives in the pagination footer, so this only offers
            the escape hatch rather than repeating the same figure twice. */}
        {(query || typeFilter !== "all") && (
          <div className="mt-3 flex items-center gap-3 text-xs text-ink2">
            <span>Filtered.</span>
            <button
              onClick={() => {
                setQuery("");
                setTypeFilter("all");
                resetPaging();
              }}
              className="font-medium text-ink underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-ink2">Nothing matches those filters.</p>
          <button
            onClick={() => {
              setQuery("");
              setTypeFilter("all");
              resetPaging();
            }}
            className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((d) => {
            const isOpen = expanded === d.id;
            const order = d.order_key ? orders[d.order_key] : undefined;
            const matched = d.transaction_refs
              .map((ref) => payments[ref])
              .filter(Boolean);

            return (
              <li key={d.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-raised ${
                    isOpen ? "bg-raised" : ""
                  }`}
                >
                  <Chevron open={isOpen} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
                          SEVERITY_STYLES[d.severity] ?? SEVERITY_STYLES.info
                        }`}
                      >
                        {d.severity}
                      </span>
                      <span className="font-medium text-ink">
                        {DISCREPANCY_LABELS[d.type]}
                      </span>
                      <span className="font-mono text-xs text-ink3">
                        {d.order_key ?? "no order"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-ink2">
                      {DISCREPANCY_SUMMARIES[d.type]}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right text-xs text-ink3 sm:block">
                    <p>
                      expected{" "}
                      <span className="tabular-nums text-ink2">
                        {d.expected_cents == null
                          ? "—"
                          : formatCents(d.expected_cents)}
                      </span>
                    </p>
                    <p>
                      settled{" "}
                      <span className="tabular-nums text-ink2">
                        {d.actual_cents == null
                          ? "—"
                          : formatCents(d.actual_cents)}
                      </span>
                    </p>
                  </div>

                  <div className="w-28 shrink-0">
                    <Delta cents={d.delta_cents} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-line bg-raised px-5 py-5">
                    <div className="rounded-lg border border-line bg-surface p-4">
                      <p className="text-sm text-ink">{d.detail}</p>
                      <p className="mt-2 text-sm">
                        <span className="font-medium text-ink">
                          What to do:
                        </span>{" "}
                        <span className="text-ink2">
                          {DISCREPANCY_ACTIONS[d.type]}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-line bg-surface p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">
                          What the store recorded
                        </h3>
                        {order ? (
                          <dl className="mt-2 text-sm">
                            <Field
                              label="Order id"
                              value={order.raw_order_id}
                            />
                            <Field
                              label="Date"
                              value={order.order_date_raw ?? "—"}
                            />
                            <Field
                              label="Customer"
                              value={order.customer_email ?? "missing"}
                              highlight={!order.customer_email}
                            />
                            <Field
                              label="Currency"
                              value={order.currency ?? "—"}
                            />
                            <Field
                              label="Gross"
                              value={formatCents(order.gross_cents)}
                            />
                            <Field
                              label="Discount"
                              value={formatCents(order.discount_cents)}
                            />
                            <Field
                              label="Net (should be charged)"
                              value={formatCents(order.net_cents)}
                            />
                            <Field label="Status" value={order.status ?? "—"} />
                          </dl>
                        ) : (
                          <p className="mt-2 rounded-md bg-over-soft px-3 py-2 text-sm text-over">
                            No order in the export matches this reference. The
                            money arrived with nothing behind it.
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-line bg-surface p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">
                          What the processor recorded
                        </h3>
                        {matched.length > 0 ? (
                          <div className="mt-2 space-y-4">
                            {matched.map((p, i) => (
                              <dl key={p.transaction_ref} className="text-sm">
                                {matched.length > 1 && (
                                  <p className="mb-1 text-xs font-semibold text-ink3">
                                    Payment {i + 1} of {matched.length}
                                  </p>
                                )}
                                <Field
                                  label="Transaction"
                                  value={p.transaction_ref}
                                />
                                <Field
                                  label="Processed"
                                  value={
                                    p.processed_at_raw?.trim() || "missing"
                                  }
                                  highlight={!p.processed_at_raw?.trim()}
                                />
                                <Field
                                  label="Reference as written"
                                  value={`"${p.raw_order_reference ?? ""}"`}
                                  highlight={
                                    p.raw_order_reference !== p.order_key
                                  }
                                />
                                <Field
                                  label="Currency"
                                  value={p.currency ?? "—"}
                                  highlight={
                                    Boolean(order) &&
                                    p.currency !== order!.currency
                                  }
                                />
                                <Field
                                  label="Amount"
                                  value={formatCents(p.amount_cents)}
                                  highlight={
                                    Boolean(order) &&
                                    p.type === "charge" &&
                                    p.amount_cents !== order!.net_cents
                                  }
                                />
                                <Field
                                  label="Fee"
                                  value={formatCents(p.fee_cents)}
                                />
                                <Field
                                  label="Type / status"
                                  value={`${p.type ?? "—"} / ${p.status ?? "—"}`}
                                  highlight={p.status !== "settled"}
                                />
                              </dl>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 rounded-md bg-under-soft px-3 py-2 text-sm text-under">
                            No payment in the export references this order. The
                            customer was never charged.
                          </p>
                        )}
                      </div>
                    </div>

                    <ExplainPanel
                      discrepancyId={d.id}
                      initial={d.llm_explanation}
                      type={d.type}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-sm">
          <p className="mr-auto text-ink3">
            Showing{" "}
            <span className="text-ink2">
              {start + 1}–{Math.min(start + pageSize, rows.length)}
            </span>{" "}
            of <span className="text-ink2">{rows.length}</span>
            {rows.length !== discrepancies.length &&
              ` (filtered from ${discrepancies.length})`}
          </p>

          <label className="flex items-center gap-2 text-xs text-ink3">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                resetPaging();
              }}
              className="rounded-md border border-line px-2 py-1 text-sm text-ink outline-none focus:border-ink"
            >
              {[6, 12, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <PageButton
              onClick={() => {
                setPage(currentPage - 1);
                setExpanded(null);
              }}
              disabled={currentPage === 1}
            >
              Previous
            </PageButton>

            {pageNumbers(currentPage, pageCount).map((n, i) =>
              n === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-ink3">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  onClick={() => {
                    setPage(n);
                    setExpanded(null);
                  }}
                  aria-current={n === currentPage ? "page" : undefined}
                  className={`min-w-8 rounded-md px-2 py-1 text-sm ${
                    n === currentPage
                      ? "bg-ink font-medium text-canvas"
                      : "text-ink2 hover:bg-raised"
                  }`}
                >
                  {n}
                </button>
              ),
            )}

            <PageButton
              onClick={() => {
                setPage(currentPage + 1);
                setExpanded(null);
              }}
              disabled={currentPage === pageCount}
            >
              Next
            </PageButton>
          </div>
        </div>
      )}
    </section>
  );
}

function PageButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-line px-2.5 py-1 text-sm text-ink2 hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * Page numbers with an ellipsis once the count grows.
 *
 * The sample dataset only needs three pages, but an import of real size would
 * otherwise render a page button per hundred rows and wrap the footer.
 */
function pageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "gap")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);

  if (from > 2) pages.push("gap");
  for (let i = from; i <= to; i++) pages.push(i);
  if (to < total - 1) pages.push("gap");
  pages.push(total);

  return pages;
}
