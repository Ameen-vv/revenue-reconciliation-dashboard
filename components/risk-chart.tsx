"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { DISCREPANCY_LABELS } from "@/lib/types";
import { formatCents, formatDollars } from "@/lib/money";
import type { TypeExposure } from "@/lib/summary";

/**
 * Exposure by type, split left and right of zero.
 *
 * Each type gets both a left segment (revenue never collected) and a right
 * segment (money out the door) rather than one netted bar. A single netted bar
 * lets opposite problems inside one type cancel: the status conflicts would
 * show as $196 when they are really $295 owed back plus $99 uncollected. The
 * full width of a row is therefore the true size of that problem.
 *
 * Colours are theme variables so the chart follows the theme switch; both
 * pairs were validated for colour-vision deficiency against their own surface,
 * and every segment is directly labelled so nothing depends on colour alone.
 */

const OVER = "var(--over)";
const UNDER = "var(--under)";
const AXIS = "var(--ink3)";
const BASELINE = "var(--line)";

type Row = TypeExposure & { out: number; under: number };

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-ink">{DISCREPANCY_LABELS[d.type]}</p>
      <p className="mt-1 text-ink3">
        {d.count} {d.count === 1 ? "case" : "cases"} ·{" "}
        {formatDollars(d.totalCents)} total
      </p>
      {d.outCents > 0 && (
        <p className="mt-1 text-over">
          {formatDollars(d.outCents)} out the door
        </p>
      )}
      {d.underCents > 0 && (
        <p className="text-under">
          {formatDollars(d.underCents)} never collected
        </p>
      )}
    </div>
  );
}

export default function RiskChart({ data }: { data: TypeExposure[] }) {
  // Types with no quantifiable money would render as an empty row and read as
  // "nothing here", which is the opposite of true. Named below instead.
  const plotted: Row[] = data
    .filter((d) => d.totalCents > 0)
    .map((d) => ({ ...d, out: d.outCents, under: -d.underCents }));
  const omitted = data.filter((d) => d.totalCents === 0);

  if (plotted.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink3">
        No quantifiable exposure to chart.
      </p>
    );
  }

  const max = Math.max(
    ...plotted.map((d) => Math.max(d.outCents, d.underCents)),
  );
  const bound = Math.ceil((max * 1.3) / 10000) * 10000;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-ink2">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: UNDER }}
          />
          Never collected (left)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: OVER }}
          />
          Out the door (right)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={plotted.length * 46 + 44}>
        <BarChart
          data={plotted}
          layout="vertical"
          stackOffset="sign"
          margin={{ top: 16, right: 70, bottom: 8, left: 130 }}
        >
          <XAxis
            type="number"
            domain={[-bound, bound]}
            tickFormatter={(v: number) => formatCents(Math.abs(v))}
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
            tickFormatter={(t: keyof typeof DISCREPANCY_LABELS) =>
              DISCREPANCY_LABELS[t]
            }
          />
          <ReferenceLine x={0} stroke={BASELINE} />
          <Tooltip cursor={{ fill: "var(--raised)" }} content={<ChartTooltip />} />
          <Bar
            dataKey="under"
            stackId="exposure"
            fill={UNDER}
            radius={4}
            barSize={16}
            isAnimationActive={false}
            label={{
              position: "left",
              fontSize: 11,
              fill: "var(--ink2)",
              formatter: (v: unknown) =>
                typeof v === "number" && v !== 0
                  ? formatCents(Math.abs(v))
                  : "",
            }}
          />
          <Bar
            dataKey="out"
            stackId="exposure"
            fill={OVER}
            radius={4}
            barSize={16}
            isAnimationActive={false}
            label={{
              position: "right",
              fontSize: 11,
              fill: "var(--ink2)",
              formatter: (v: unknown) =>
                typeof v === "number" && v !== 0 ? formatCents(v) : "",
            }}
          />
        </BarChart>
      </ResponsiveContainer>

      {omitted.length > 0 && (
        <p className="mt-1 border-t border-line pt-3 text-xs text-ink3">
          Not shown, because no dollar figure can honestly be put on them:{" "}
          {omitted
            .map((d) => `${DISCREPANCY_LABELS[d.type].toLowerCase()} (${d.count})`)
            .join(", ")}
          . These are real findings — see the discrepancies page.
        </p>
      )}
    </div>
  );
}
