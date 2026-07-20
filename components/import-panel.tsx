"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; message: string };

/**
 * Triggers ingestion. Both the sample dataset and an uploaded pair of files
 * post to the same endpoint; only the body differs.
 */
export default function ImportPanel({ hasData }: { hasData: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "idle" });

  async function runImport(body?: FormData) {
    setState({ status: "working" });
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        ...(body ? { body } : {}),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setState({
          status: "error",
          message: payload?.error ?? `Import failed (${response.status}).`,
        });
        return;
      }

      setState({ status: "idle" });
      router.refresh();
    } catch {
      setState({
        status: "error",
        message: "Could not reach the server. Check your connection and retry.",
      });
    }
  }

  async function onUpload(event: React.ChangeEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const data = new FormData(form);
    const orders = data.get("orders");
    const payments = data.get("payments");
    if (!(orders instanceof File) || !(payments instanceof File)) return;
    if (orders.size === 0 || payments.size === 0) return;
    await runImport(data);
    form.reset();
  }

  const working = state.status === "working";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {hasData ? "Run another import" : "Load data"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Each run is stored separately; the dashboard shows the most recent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onChange={onUpload} className="flex items-center gap-2">
            <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
              Orders CSV
              <input
                type="file"
                name="orders"
                accept=".csv,text/csv"
                className="hidden"
                disabled={working}
              />
            </label>
            <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
              Payments CSV
              <input
                type="file"
                name="payments"
                accept=".csv,text/csv"
                className="hidden"
                disabled={working}
              />
            </label>
          </form>

          <button
            onClick={() => runImport()}
            disabled={working}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {working ? "Reconciling…" : "Load sample dataset"}
          </button>
        </div>
      </div>

      {working && (
        <p className="mt-4 text-sm text-slate-500">
          Parsing both files, matching orders to payments and classifying
          differences. This runs entirely on the server.
        </p>
      )}

      {state.status === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
