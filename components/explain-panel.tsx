"use client";

import { useState } from "react";
import type { LlmExplanation } from "@/lib/summary";
import type { DiscrepancyType } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; explanation: LlmExplanation; fallback: boolean }
  | { status: "error"; message: string };

/**
 * Requests the generated explanation for one discrepancy.
 *
 * Only the discrepancy id crosses the wire; the record itself is loaded
 * server-side. Three outcomes are shown distinctly: a generated explanation,
 * a static fallback when the model failed, and a hard error. Collapsing the
 * middle case into the first would let a canned answer pass as analysis.
 */
export default function ExplainPanel({
  discrepancyId,
  initial,
  type,
}: {
  discrepancyId: string;
  initial: LlmExplanation | null;
  type: DiscrepancyType;
}) {
  const [state, setState] = useState<State>(
    initial
      ? { status: "done", explanation: initial, fallback: Boolean(initial.fallback) }
      : { status: "idle" },
  );

  async function explain() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discrepancyId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setState({
          status: "error",
          message:
            payload?.error ?? `The explanation service failed (${response.status}).`,
        });
        return;
      }

      if (!payload?.explanation) {
        setState({
          status: "error",
          message: "The explanation service returned nothing usable.",
        });
        return;
      }

      setState({
        status: "done",
        explanation: payload.explanation,
        fallback: Boolean(payload.fallback || payload.explanation.fallback),
      });
    } catch {
      setState({
        status: "error",
        message: "Could not reach the explanation service. Check your connection.",
      });
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">
          Explanation
        </h3>
        {state.status !== "done" && (
          <button
            onClick={explain}
            disabled={state.status === "loading"}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink2 disabled:opacity-50"
          >
            {state.status === "loading" ? "Analysing…" : "Explain this"}
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <p className="mt-2 text-sm text-ink3">
          Generate a plain-language account of what likely happened and what to
          do about it. The classification above is not affected.
        </p>
      )}

      {state.status === "loading" && (
        <p className="mt-2 animate-pulse text-sm text-ink3">
          Sending the record for analysis…
        </p>
      )}

      {state.status === "error" && (
        <div className="mt-2">
          <p role="alert" className="rounded-md bg-over-soft px-3 py-2 text-sm text-over">
            {state.message}
          </p>
          <button
            onClick={explain}
            className="mt-2 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink2"
          >
            Retry
          </button>
        </div>
      )}

      {state.status === "done" && (
        <div className="mt-3 space-y-3 text-sm">
          {state.fallback && (
            <p className="rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
              The model was unavailable or returned an unusable response. This
              is the standard guidance for a {type.replace(/_/g, " ")}, not an
              analysis of this specific row.
            </p>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">
              Likely cause
            </p>
            <p className="mt-1 text-ink">{state.explanation.likely_cause}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">
              Recommended action
            </p>
            <p className="mt-1 text-ink">
              {state.explanation.recommended_action}
            </p>
          </div>
          <p className="text-xs text-ink3">
            Confidence: {state.explanation.confidence}
          </p>
        </div>
      )}
    </div>
  );
}
