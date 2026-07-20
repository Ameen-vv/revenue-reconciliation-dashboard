"use client";

import { useMemo, useState } from "react";
import { DISCREPANCY_LABELS, type DiscrepancyType } from "@/lib/types";
import { severityRank } from "@/lib/reconcile";
import { formatCents } from "@/lib/money";
import type { DiscrepancyRow, OrderRow, PaymentRow } from "@/lib/summary";
import ExplainPanel from "@/components/explain-panel";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 ring-red-200",
  high: "bg-orange-50 text-orange-700 ring-orange-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-slate-50 text-slate-600 ring-slate-200",
};

function Delta({ cents }: { cents: number | null }) {
  if (cents == null) {
    return (
      <span
        className="text-slate-400"
        title="Not quantifiable without an exchange rate"
      >
        n/a
      </span>
    );
  }
  if (cents === 0) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={cents > 0 ? "font-medium text-red-700" : "font-medium text-blue-700"}
    >
      {cents > 0 ? "+" : "−"}
      {formatCents(Math.abs(cents))}
    </span>
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
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={
          highlight ? "font-medium text-red-700" : "text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default function DiscrepancyTable({
  discrepancies,
  orders,
  payments,
}: {
  discrepancies: DiscrepancyRow[];
  orders: Record<string, OrderRow>;
  payments: Record<string, PaymentRow>;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DiscrepancyType | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

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

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <h2 className="mr-auto text-sm font-semibold text-slate-900">
          Discrepancies
        </h2>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search order or transaction…"
          className="w-60 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
        />

        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as DiscrepancyType | "all")
          }
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
        >
          <option value="all">All types ({discrepancies.length})</option>
          {presentTypes.map(([type, count]) => (
            <option key={type} value={type}>
              {DISCREPANCY_LABELS[type]} ({count})
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">
          No discrepancies match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Transactions</th>
                <th className="px-4 py-2 text-right font-medium">Expected</th>
                <th className="px-4 py-2 text-right font-medium">Settled</th>
                <th className="px-4 py-2 text-right font-medium">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const isOpen = expanded === d.id;
                const order = d.order_key ? orders[d.order_key] : undefined;
                const matched = d.transaction_refs
                  .map((ref) => payments[ref])
                  .filter(Boolean);

                return (
                  <tr key={d.id} className="border-b border-slate-100 align-top">
                    <td colSpan={6} className="p-0">
                      <button
                        onClick={() => setExpanded(isOpen ? null : d.id)}
                        aria-expanded={isOpen}
                        className="grid w-full grid-cols-[1.4fr_0.8fr_1.4fr_0.8fr_0.8fr_0.8fr] items-center gap-0 text-left hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2 px-4 py-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                              SEVERITY_STYLES[d.severity] ?? SEVERITY_STYLES.info
                            }`}
                          >
                            {d.severity}
                          </span>
                          <span className="text-slate-900">
                            {DISCREPANCY_LABELS[d.type]}
                          </span>
                        </span>
                        <span className="px-4 py-3 font-mono text-xs text-slate-700">
                          {d.order_key ?? "—"}
                        </span>
                        <span className="px-4 py-3 font-mono text-xs text-slate-500">
                          {d.transaction_refs.join(", ") || "—"}
                        </span>
                        <span className="px-4 py-3 text-right text-slate-700">
                          {d.expected_cents == null
                            ? "—"
                            : formatCents(d.expected_cents)}
                        </span>
                        <span className="px-4 py-3 text-right text-slate-700">
                          {d.actual_cents == null
                            ? "—"
                            : formatCents(d.actual_cents)}
                        </span>
                        <span className="px-4 py-3 text-right">
                          <Delta cents={d.delta_cents} />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                          <p className="text-sm text-slate-700">{d.detail}</p>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Order record
                              </h3>
                              {order ? (
                                <dl className="mt-2 text-sm">
                                  <Field label="Order id" value={order.raw_order_id} />
                                  <Field
                                    label="Date"
                                    value={order.order_date_raw ?? "—"}
                                  />
                                  <Field
                                    label="Customer"
                                    value={order.customer_email ?? "missing"}
                                    highlight={!order.customer_email}
                                  />
                                  <Field label="Currency" value={order.currency ?? "—"} />
                                  <Field
                                    label="Gross"
                                    value={formatCents(order.gross_cents)}
                                  />
                                  <Field
                                    label="Discount"
                                    value={formatCents(order.discount_cents)}
                                  />
                                  <Field
                                    label="Net (expected)"
                                    value={formatCents(order.net_cents)}
                                  />
                                  <Field label="Status" value={order.status ?? "—"} />
                                </dl>
                              ) : (
                                <p className="mt-2 text-sm text-slate-500">
                                  No order in the export matches this reference.
                                </p>
                              )}
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Payment record{matched.length > 1 ? "s" : ""}
                              </h3>
                              {matched.length > 0 ? (
                                <div className="mt-2 space-y-4">
                                  {matched.map((p) => (
                                    <dl
                                      key={p.transaction_ref}
                                      className="text-sm"
                                    >
                                      <Field
                                        label="Transaction"
                                        value={p.transaction_ref}
                                      />
                                      <Field
                                        label="Processed"
                                        value={p.processed_at_raw?.trim() || "missing"}
                                        highlight={!p.processed_at_raw?.trim()}
                                      />
                                      <Field
                                        label="Reference (raw)"
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
                                      <Field label="Fee" value={formatCents(p.fee_cents)} />
                                      <Field
                                        label="Type / status"
                                        value={`${p.type ?? "—"} / ${p.status ?? "—"}`}
                                        highlight={p.status !== "settled"}
                                      />
                                    </dl>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-sm text-slate-500">
                                  No payment in the export references this order.
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
