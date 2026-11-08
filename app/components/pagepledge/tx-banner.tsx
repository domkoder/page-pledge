"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Terminal,
  X,
} from "lucide-react";
import { SimulatedTransactionLog } from "@/lib/chain";

export function SimulatedTxBanner({
  tx,
  onDismiss,
}: {
  tx: SimulatedTransactionLog | null;
  onDismiss?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!tx) return null;

  const isSuccess = tx.status === "SUCCESS";

  return (
    <div
      className={`mb-5 rounded-xl border px-4 py-3 transition-all ${
        isSuccess
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
          : "border-rose-500/40 bg-rose-500/10 text-rose-950 dark:text-rose-100"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {isSuccess ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span className="rounded bg-black/10 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider dark:bg-white/10">
            ix:{tx.instruction}
          </span>
          {tx.errorCode && (
            <span className="rounded bg-rose-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
              Error: {tx.errorCode}
            </span>
          )}
          <span className="text-xs font-medium">{tx.summary}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[11px] opacity-75 sm:inline">
            sig: {tx.signature.slice(0, 14)}...
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-current/20 px-2 py-1 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Terminal className="h-3 w-3" />
            {expanded ? "Hide Tx" : "Inspect Tx"}
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss transaction banner"
              className="rounded p-1 opacity-70 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 rounded-lg bg-neutral-950 p-3 font-mono text-xs text-neutral-200">
          <div className="mb-1 flex flex-wrap justify-between gap-2 border-b border-neutral-800 pb-1.5 text-[11px] text-neutral-400">
            <span>Signature: {tx.signature}</span>
            <span>Caller: {tx.caller}</span>
            <span>
              Simulated Block Time:{" "}
              {new Date(tx.timestamp * 1000).toISOString()}
            </span>
          </div>
          <pre className="overflow-x-auto text-[11px] leading-relaxed text-emerald-300">
            {JSON.stringify(tx.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
