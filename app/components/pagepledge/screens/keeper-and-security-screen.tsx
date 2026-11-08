"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  Play,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { usePagePledgeStore } from "@/lib/store/use-pagepledge-store";

export function KeeperAndSecurityScreen() {
  const {
    keeperBotEnabled,
    keeperLogs,
    securityDemoRows,
    securityDemoCohortId,
    setKeeperBotEnabled,
    runKeeperSweepOnce,
    runSecurityDemo,
  } = usePagePledgeStore();

  const [sweeping, setSweeping] = useState(false);
  const [runningSec, setRunningSec] = useState(false);

  const handleManualSweep = async () => {
    setSweeping(true);
    try {
      const count = await runKeeperSweepOnce();
      toast.info(`Keeper sweep finished (${count} on-chain actions executed)`);
    } finally {
      setSweeping(false);
    }
  };

  const handleRunSecurity = async () => {
    setRunningSec(true);
    try {
      const rows = await runSecurityDemo();
      toast.success(
        `Security Demo verified: ${rows.filter((r) => r.passedCheck).length}/${rows.length} exploits rejected with exact program error codes!`
      );
    } finally {
      setRunningSec(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Screen 6: Permissionless Keeper Bot Panel */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-lg font-bold tracking-tight">
                Permissionless Keeper Sweeper Bot
              </h2>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-800 dark:text-amber-300">
                NO SPECIAL PRIVILEGES
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Sweeps every few seconds and calls the exact same public{" "}
              <code className="font-mono">ChainClient.settleUser</code> &amp;{" "}
              <code className="font-mono">finalize</code> methods as any
              participant persona. Any persona (Alice, Bob, Carol, Dave) can
              settle eligible users and earn the{" "}
              <code className="font-mono">min(1% forfeit, 0.01 SOL)</code>{" "}
              bounty.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={sweeping}
              onClick={handleManualSweep}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-bold hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
            >
              <Play className="h-3.5 w-3.5" />
              {sweeping ? "Sweeping..." : "Trigger 1 Sweep Now"}
            </button>
            <button
              type="button"
              onClick={() => setKeeperBotEnabled(!keeperBotEnabled)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition ${
                keeperBotEnabled
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              <Bot className="h-4 w-4" />
              {keeperBotEnabled
                ? "Auto-Sweeper: RUNNING (Pause)"
                : "Start Auto-Sweeper (Every 3s)"}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-neutral-950 p-4 font-mono text-xs text-neutral-200">
          <div className="mb-2 flex items-center justify-between border-b border-neutral-800 pb-2 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              Keeper Decision Log (Latest {keeperLogs.length} entries)
            </span>
            <span>Caller: keeper (Public Path)</span>
          </div>

          {keeperLogs.length === 0 ? (
            <p className="py-4 text-center text-neutral-500">
              No keeper sweeps recorded yet. Toggle Auto-Sweeper ON or click
              &quot;Trigger 1 Sweep Now&quot; (jump past grace window first to
              see settlements).
            </p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {keeperLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded bg-neutral-900/90 px-2.5 py-1.5 text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        log.action === "SETTLE" || log.action === "FINALIZE"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {log.action}
                    </span>
                    <span>{log.message}</span>
                  </div>
                  {log.txSignature && (
                    <span className="text-[10px] text-indigo-400">
                      sig: {log.txSignature.slice(0, 12)}...
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Screen 8: Security Demo Table (9 Live Attack Vectors) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              <h2 className="text-lg font-bold tracking-tight">
                Protocol Security Verification Suite (9 Live Exploits)
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Executes 9 adversarial attempts against a live cohort on{" "}
              <code className="font-mono">MockChain</code> and verifies that
              every single exploit is deterministically rejected with the exact
              program error code.
            </p>
          </div>

          <button
            type="button"
            disabled={runningSec}
            onClick={handleRunSecurity}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            {runningSec
              ? "Executing 9 Exploits..."
              : "Run Security Demo Against Live Cohort"}
          </button>
        </div>

        {securityDemoRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-800">
            <p className="text-xs text-neutral-500">
              Click{" "}
              <strong>&quot;Run Security Demo Against Live Cohort&quot;</strong>{" "}
              above (or in the Demo Control Drawer) to execute all 9 protocol
              exploit attempts and inspect the results table.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="mb-2 font-mono text-xs text-emerald-600 dark:text-emerald-400">
              Target Cohort: <strong>{securityDemoCohortId}</strong> • All{" "}
              {securityDemoRows.filter((r) => r.passedCheck).length}/
              {securityDemoRows.length} adversarial vectors blocked!
            </div>
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-500 dark:border-neutral-800">
                  <th className="py-2.5 pr-3">Adversarial Attempt</th>
                  <th className="px-3 py-2.5">Vector Description</th>
                  <th className="px-3 py-2.5">Expected Error Code</th>
                  <th className="px-3 py-2.5">Actual Result</th>
                  <th className="py-2.5 pl-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {securityDemoRows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-neutral-50/60 dark:hover:bg-neutral-950/40"
                  >
                    <td className="py-3 pr-3 font-bold">{row.attempt}</td>
                    <td className="px-3 py-3 text-neutral-600 dark:text-neutral-400">
                      <div>{row.description}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-neutral-400">
                        {row.detailMessage}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-neutral-200 px-2 py-0.5 font-mono text-[11px] font-bold dark:bg-neutral-800">
                        {row.expectedErrorCode}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-700 dark:text-rose-300">
                        Rejected: {row.actualErrorCode}
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {row.passedCheck ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          BLOCKED (OK)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-rose-700">
                          <XCircle className="h-3.5 w-3.5" />
                          FAILED
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
