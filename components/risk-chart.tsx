"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { DISCREPANCY_LABELS, type DiscrepancyType } from "@/lib/types";
import { formatCents } from "@/lib/money";

/**
 * Signed exposure by discrepancy type.
 *
 * A diverging bar centred on zero rather than a plain magnitude chart, because
 * the sign is the point: bars to the right are money that left the business or
 * arrived unattributed, bars to the left are revenue that was never collected.
 * Ranking by absolute size alone would put two opposite problems side by side
 * and imply they need the same response.
 *
 * Two hues plus a neutral zero line, validated for colour-vision deficiency
 * against the white card surface. Every bar is also directly labelled, so the
 * reading never depends on colour alone.
 */

const OVER = "#e34948"; // money out the door / unattributed
const UNDER = "#2a78d6"; // revenue never banked
const AXIS = "#898781";
const BASELINE = "#c3c2b7";

type Datum = { type: DiscrepancyType; cents: number; count: number };

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{DISCREPANCY_LABELS[d.type]}</p>
      <p className="mt-1 text-slate-600">
        {d.count} {d.count === 1 ? "case" : "cases"}
      </p>
      <p className="text-slate-600">
        {d.cents >= 0 ? "Excess / unattributed" : "Never collected"}:{" "}
        <span className="font-medium text-slate-900">
          {formatCents(Math.abs(d.cents))}
        </span>
      </p>
    </div>
  );
}

export default function RiskChart({ data }: { data: Datum[] }) {
  // Types with no quantifiable delta (currency mismatch) would render as an
  // invisible zero-width bar and read as "no exposure", which is the opposite
  // of true. They are named below the chart instead of vanishing from it.
  const plotted = data.filter((d) => d.cents !== 0);
  const omitted = data.filter((d) => d.cents === 0);

  if (plotted.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        No quantifiable exposure to chart.
      </p>
    );
  }

  // Round the axis bound up to a whole 100 units of currency so the generated
  // ticks land on readable numbers instead of arbitrary fractions of the max.
  const max = Math.max(...plotted.map((d) => Math.abs(d.cents)));
  const bound = Math.ceil((max * 1.25) / 10000) * 10000;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: OVER }}
          />
          Taken in excess or unattributed
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: UNDER }}
          />
          Never collected
        </span>
      </div>

      <ResponsiveContainer width="100%" height={plotted.length * 44 + 40}>
        <BarChart
          data={plotted}
          layout="vertical"
          margin={{ top: 16, right: 80, bottom: 8, left: 130 }}
        >
          <XAxis
            type="number"
            domain={[-bound, bound]}
            tickFormatter={(v: number) => formatCents(v)}
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="type"
            width={130}
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(t: DiscrepancyType) => DISCREPANCY_LABELS[t]}
          />
          <ReferenceLine x={0} stroke={BASELINE} />
          <Tooltip
            cursor={{ fill: "#f1f5f9" }}
            content={<ChartTooltip />}
          />
          <Bar
            dataKey="cents"
            radius={4}
            barSize={16}
            isAnimationActive={false}
            label={{
              position: "right",
              fontSize: 11,
              fill: "#52514e",
              formatter: (v: unknown) =>
                typeof v === "number" ? formatCents(Math.abs(v)) : "",
            }}
          >
            {plotted.map((d) => (
              <Cell key={d.type} fill={d.cents >= 0 ? OVER : UNDER} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {omitted.length > 0 && (
        <p className="mt-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Not shown, because no dollar figure can honestly be put on them:{" "}
          {omitted
            .map(
              (d) =>
                `${DISCREPANCY_LABELS[d.type].toLowerCase()} (${d.count})`,
            )
            .join(", ")}
          . These are real findings — see the table below.
        </p>
      )}
    </div>
  );
}
