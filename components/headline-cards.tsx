import { formatCents } from "@/lib/money";
import type { Summary } from "@/lib/summary";

function Card({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "over" | "under";
}) {
  const valueColor =
    tone === "over"
      ? "text-red-700"
      : tone === "under"
        ? "text-blue-700"
        : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default function HeadlineCards({ summary }: { summary: Summary }) {
  const {
    ordersCount,
    paymentsCount,
    discrepancyCount,
    reconciledCents,
    disputedCents,
    overchargedCents,
    underCollectedCents,
    netAtRiskCents,
  } = summary;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Orders"
          value={String(ordersCount)}
          hint="Unique orders after deduplication"
        />
        <Card
          label="Payments"
          value={String(paymentsCount)}
          hint="Rows from the processor export"
        />
        <Card
          label="Value reconciled"
          value={formatCents(reconciledCents)}
          hint="Order value with nothing flagged against it"
        />
        <Card
          label="Value in dispute"
          value={formatCents(disputedCents)}
          hint={`Order value touched by ${discrepancyCount} discrepancies`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          label="Taken in excess"
          value={formatCents(overchargedCents)}
          hint="Duplicate charges, overcharges and unattributed payments — refund before it becomes a chargeback"
          tone="over"
        />
        <Card
          label="Never collected"
          value={formatCents(Math.abs(underCollectedCents))}
          hint="Completed orders and shortfalls the store was never paid for — chase these"
          tone="under"
        />
        <Card
          label="Net at risk"
          value={`${netAtRiskCents >= 0 ? "+" : "−"}${formatCents(Math.abs(netAtRiskCents))}`}
          hint="The two directions nearly cancel, which is exactly why the net figure alone is misleading"
          tone={netAtRiskCents >= 0 ? "over" : "under"}
        />
      </div>
    </div>
  );
}
