"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; message: string };

/**
 * Ingestion controls.
 *
 * Two explicit paths, each with its own button, rather than file inputs
 * styled to look like buttons that silently submit on change. Uploading now
 * shows the chosen filenames and waits for a deliberate confirmation, so it
 * is always clear what is about to be imported and when it actually runs.
 */
export default function ImportPanel({ hasData }: { hasData: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "idle" });
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [paymentsFile, setPaymentsFile] = useState<File | null>(null);
  const ordersInput = useRef<HTMLInputElement>(null);
  const paymentsInput = useRef<HTMLInputElement>(null);

  const working = state.status === "working";
  const canUpload = Boolean(ordersFile && paymentsFile) && !working;

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

      setOrdersFile(null);
      setPaymentsFile(null);
      if (ordersInput.current) ordersInput.current.value = "";
      if (paymentsInput.current) paymentsInput.current.value = "";
      setState({ status: "idle" });
      router.refresh();
    } catch {
      setState({
        status: "error",
        message: "Could not reach the server. Check your connection and retry.",
      });
    }
  }

  function uploadOwn() {
    if (!ordersFile || !paymentsFile) return;
    const body = new FormData();
    body.set("orders", ordersFile);
    body.set("payments", paymentsFile);
    void runImport(body);
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {hasData ? "Import more data" : "Import data"}
          </h2>
          <p className="mt-1 text-sm text-ink3">
            Each import is saved on its own. The dashboard always shows the most
            recent one.
          </p>
        </div>

        <button
          onClick={() => runImport()}
          disabled={working}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          {working ? "Reconciling…" : "Load sample dataset"}
        </button>
      </div>

      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm text-ink2 hover:text-ink">
          Or upload your own CSV files
        </summary>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FilePicker
            label="Orders CSV"
            hint="order_id, order_date, currency, gross_amount, discount, net_amount, status"
            file={ordersFile}
            inputRef={ordersInput}
            onPick={setOrdersFile}
            disabled={working}
          />
          <FilePicker
            label="Payments CSV"
            hint="transaction_ref, processed_at, order_reference, amount, fee, type, status"
            file={paymentsFile}
            inputRef={paymentsInput}
            onPick={setPaymentsFile}
            disabled={working}
          />
        </div>

        <button
          onClick={uploadOwn}
          disabled={!canUpload}
          className="mt-3 rounded-md border border-line px-4 py-2 text-sm font-medium text-ink2 hover:bg-raised disabled:opacity-50"
        >
          {working ? "Reconciling…" : "Import these two files"}
        </button>
        {!canUpload && !working && (
          <p className="mt-2 text-xs text-ink3">
            Both files are needed before an import can run.
          </p>
        )}
      </details>

      {working && (
        <p className="mt-4 rounded-md bg-raised px-3 py-2 text-sm text-ink2">
          Parsing both files, matching orders to payments, and classifying every
          difference. This runs on the server and takes a moment.
        </p>
      )}

      {state.status === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-over-soft px-3 py-2 text-sm text-over"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

function FilePicker({
  label,
  hint,
  file,
  inputRef,
  onPick,
  disabled,
}: {
  label: string;
  hint: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line p-3">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="mt-0.5 truncate text-xs text-ink3" title={hint}>
        {file ? file.name : hint}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="mt-2 block w-full text-xs text-ink2 file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink2"
      />
    </div>
  );
}
