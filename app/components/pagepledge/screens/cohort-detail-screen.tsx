'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gavel,
  Scale,
  ShieldCheck,
  UserPlus,
  Play,
} from 'lucide-react';
import { MilestoneOutcome, computeForfeit, computeSettleBounty, formatSol } from '@/lib/economics';
import { usePagePledgeStore } from '@/lib/store/use-pagepledge-store';

function outcomeChipStyle(outcome: MilestoneOutcome): string {
  switch (outcome) {
    case 'PASSED':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300';
    case 'COMMITTED':
      return 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300';
    case 'MISSED':
      return 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300';
    case 'NEUTRAL':
      return 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300';
    case 'PENDING':
    default:
      return 'bg-neutral-200/70 text-neutral-600 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700';
  }
}

export function CohortDetailAndSettleScreen() {
  const {
    chain,
    cohorts,
    selectedCohortId,
    activePersona,
    now,
    yieldAprBps,
    lenderLossBps,
    transactions,
    setSelectedMilestoneIdx,
    setActiveScreen,
    joinCohort,
    startCohort,
    settleUser,
    finalizeCohort,
    claimPayout,
  } = usePagePledgeStore();

  const [expandedTxSig, setExpandedTxSig] = useState<string | null>(null);

  const cohort = cohorts.find((c) => c.id === selectedCohortId) ?? cohorts[0];

  if (!cohort) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">
          No cohort selected. Create one on the Home/Create screen.
        </p>
      </div>
    );
  }

  const econ = chain.computeLiveEconomics(cohort.id);
  const participants = Object.values(cohort.participants);
  const lastDeadline = cohort.deadlines[cohort.milestoneCount - 1];
  const settleWindowOpen = now > lastDeadline + cohort.gracePeriodSeconds;
  const cohortTxs = transactions.filter((t) => !t.cohortId || t.cohortId === cohort.id);

  const handleSettleUser = async (targetUser: string) => {
    try {
      await settleUser(cohort.id, targetUser, activePersona);
      toast.success(`${activePersona} settled ${targetUser}!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Settlement failed');
    }
  };

  const handleFinalize = async () => {
    try {
      await finalizeCohort(cohort.id, activePersona);
      toast.success(`Cohort "${cohort.title}" finalized!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Finalize failed');
    }
  };

  const handleClaim = async (user: string) => {
    try {
      const payout = await claimPayout(cohort.id, user);
      toast.success(`${user} claimed ${formatSol(payout)}!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Claim failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Cohort Header Banner */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight">{cohort.title}</h2>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                Status: {cohort.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {cohort.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-neutral-400">
              <span>Program: {cohort.programId.slice(0, 16)}...</span>
              <span>Oracle: {cohort.oraclePubkeyHex.slice(0, 16)}...</span>
              <span>Content Hash: {cohort.contentHash.slice(0, 16)}...</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {cohort.status === 'Open' && !cohort.participants[activePersona] && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await joinCohort(cohort.id, activePersona);
                    toast.success(`${activePersona} joined cohort!`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Join failed');
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <UserPlus className="h-4 w-4" />
                Join as {activePersona} ({formatSol(cohort.stake)})
              </button>
            )}
            {cohort.status === 'Open' && participants.length >= 2 && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await startCohort(cohort.id);
                    toast.success('Cohort started!');
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Start failed');
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Play className="h-4 w-4" />
                Start Cohort
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveScreen('participant')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-500/20 dark:text-indigo-200"
            >
              Open Participant Quiz Terminal &rarr;
            </button>
          </div>
        </div>

        {/* Milestone Timeline */}
        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">
            Milestone Timeline & Deadlines (Grace: +{cohort.gracePeriodSeconds}s)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {cohort.deadlines.map((dl, idx) => {
              const graceEnd = dl + cohort.gracePeriodSeconds;
              const isCommitOpen = now <= dl;
              const isInGrace = now > dl && now <= graceEnd;
              const outcome = chain.getMilestoneOutcome(cohort, activePersona, idx, now);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedMilestoneIdx(idx);
                    setActiveScreen('participant');
                  }}
                  className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 text-left transition hover:border-indigo-400 dark:border-neutral-800 dark:bg-neutral-950/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold">Milestone {idx + 1}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${outcomeChipStyle(
                        outcome
                      )}`}
                    >
                      {outcome}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-neutral-500">
                    Due: {new Date(dl * 1000).toISOString().slice(0, 16).replace('T', ' ')}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold">
                    {isCommitOpen ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Commit Window Open
                      </span>
                    ) : isInGrace ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        In Grace Window (Attest Only)
                      </span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400">Window Closed</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Participants Table & Settle/Claim Controls */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold tracking-tight">
              Participants & Per-Milestone Outcomes (Settle / Claim)
            </h3>
            <p className="text-xs text-neutral-500">
              Anyone can call <code className="font-mono">settle_user</code> after the final milestone grace window closes and earn{' '}
              <code className="font-mono">min(1% of forfeit, 0.01 SOL)</code>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFinalize}
              disabled={cohort.status === 'Finalized'}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-40"
            >
              <Gavel className="h-3.5 w-3.5" />
              {cohort.status === 'Finalized'
                ? 'Cohort Finalized'
                : `Finalize Cohort (as ${activePersona})`}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-500 dark:border-neutral-800">
                <th className="py-2.5 pr-3">Participant</th>
                <th className="px-3 py-2.5">Stake</th>
                <th className="px-3 py-2.5">Per-Milestone Status Chips</th>
                <th className="px-3 py-2.5">Bitmap</th>
                <th className="px-3 py-2.5">Forfeit / Bounty</th>
                <th className="px-3 py-2.5">Est. Payout</th>
                <th className="py-2.5 pl-3 text-right">Protocol Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80">
              {participants.map((p) => {
                const econRow = econ.participants.find((ep) => ep.user === p.user);
                let liveMissed = 0;
                const outcomes: MilestoneOutcome[] = [];
                for (let i = 0; i < cohort.milestoneCount; i++) {
                  const o = chain.getMilestoneOutcome(cohort, p.user, i, now);
                  outcomes.push(o);
                  if (o === 'MISSED') liveMissed++;
                }
                const estForfeit = computeForfeit(p.stake, liveMissed, cohort.milestoneCount);
                const estBounty = computeSettleBounty(estForfeit);

                return (
                  <tr key={p.user} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-950/40">
                    <td className="py-3 pr-3 font-bold capitalize">
                      {p.user}
                      {p.user === activePersona && (
                        <span className="ml-1.5 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                          you
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono">{formatSol(p.stake)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {outcomes.map((outcome, mIdx) => (
                          <span
                            key={mIdx}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${outcomeChipStyle(
                              outcome
                            )}`}
                          >
                            M{mIdx + 1}: {outcome.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-neutral-500">
                      0b{p.completedBitmap.toString(2).padStart(cohort.milestoneCount, '0')}
                    </td>
                    <td className="px-3 py-3 font-mono">
                      <div className="text-rose-600 dark:text-rose-400">
                        -{formatSol(econRow?.forfeit ?? estForfeit, { maxDecimals: 9 })}
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400">
                        Bounty: {formatSol(econRow?.bounty ?? estBounty, { maxDecimals: 9 })}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatSol(econRow?.payout ?? p.stake, { maxDecimals: 9 })}
                      {econRow?.eligible && (
                        <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-300">
                          +Pool
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!p.settled ? (
                          <button
                            type="button"
                            onClick={() => handleSettleUser(p.user)}
                            className={`rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold transition ${
                              settleWindowOpen
                                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
                                : 'border border-neutral-300 bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                            }`}
                          >
                            Settle (+{formatSol(estBounty, { maxDecimals: 9 })})
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Settled by {p.settledBy}
                          </span>
                        )}

                        {!p.claimed ? (
                          <button
                            type="button"
                            onClick={() => handleClaim(p.user)}
                            className={`rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold transition ${
                              cohort.status === 'Finalized'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'border border-neutral-300 bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                            }`}
                          >
                            Claim
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 px-2 py-1 font-mono text-[10px] font-bold text-purple-700 dark:text-purple-300">
                            <Award className="h-3 w-3" />
                            Claimed
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Money-Flow Panel & Live Solvency Check */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-base font-bold tracking-tight">
                Protocol Money-Flow & Live Solvency Verification
              </h3>
              <p className="text-xs text-neutral-500">
                All math uses integer base units (9-decimal SOL lamports <code className="font-mono">BigInt</code>). Zero floating-point operations.
              </p>
            </div>
          </div>

          <div
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 font-mono text-xs font-bold ${
              econ.invariantHolds
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-300'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Solvency Check: {econ.invariantHolds ? 'OK (SOLVENT)' : 'VIOLATION'}
          </div>
        </div>

        {/* Solvency Equation Banner */}
        <div className="mb-5 rounded-xl border border-emerald-500/30 bg-neutral-950 p-4 font-mono text-xs text-neutral-100">
          <div className="text-[11px] uppercase tracking-wider text-neutral-400">
            Protocol Solvency Invariant: sum(payouts) + fee + dust === A (Assets at Finalize)
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-bold text-emerald-400">
            <span>{formatSol(econ.totalPayouts, { maxDecimals: 9 })} (Payouts)</span>
            <span>+</span>
            <span>{formatSol(econ.fee, { maxDecimals: 9 })} (Fee 200bps)</span>
            <span>+</span>
            <span>
              {formatSol(econ.dust, { maxDecimals: 9 })} (Dust
              {econ.nobodyEligible ? ' + Unclaimed Yield Sweep' : ''})
            </span>
            <span>===</span>
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">
              {formatSol(econ.assets, { maxDecimals: 9 })} (Assets A)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500">1. Deposits sum(S_i)</div>
            <div className="mt-1 font-mono text-sm font-bold">
              {formatSol(econ.totalDeposits)}
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-400">
              Liabilities U: {formatSol(econ.liabilities, { maxDecimals: 9 })}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500">2. Gross Forfeits sum(F_i)</div>
            <div className="mt-1 font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
              {formatSol(econ.totalForfeits, { maxDecimals: 9 })}
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-400">
              Bounties B: {formatSol(econ.totalBounties, { maxDecimals: 9 })}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500">3. Net Forfeits sum(N_i)</div>
            <div className="mt-1 font-mono text-sm font-bold">
              {formatSol(econ.totalNetForfeits, { maxDecimals: 9 })}
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-400">
              Protocol Fee (2%): {formatSol(econ.fee, { maxDecimals: 9 })}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500">
              4. Simulated Yield Reserve
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
              +{formatSol(econ.yieldAmount, { maxDecimals: 9 })}
            </div>
            <div className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              Sim APR ({Number(yieldAprBps) / 100}%) — Not real APY
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500">5. Haircut h = min(1, A/U)</div>
            <div
              className={`mt-1 font-mono text-sm font-bold ${
                econ.isHaircut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
              }`}
            >
              {(Number(econ.haircutBps) / 100).toFixed(2)}%
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-400">
              Lender Loss: {(Number(lenderLossBps) / 100).toFixed(0)}%
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500">6. Finisher Reward Pool</div>
            <div className="mt-1 font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
              {formatSol(econ.pool, { maxDecimals: 9 })}
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-400">
              {econ.nobodyEligible ? 'Nobody eligible (refunded)' : 'Shared by eligible finishers'}
            </div>
          </div>
        </div>
      </section>

      {/* Activity Log of Simulated Transactions */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-500" />
            <h3 className="text-base font-bold tracking-tight">
              Simulated Chain Transaction Log
            </h3>
          </div>
          <span className="font-mono text-xs text-neutral-400">
            {cohortTxs.length} transaction{cohortTxs.length === 1 ? '' : 's'}
          </span>
        </div>

        {cohortTxs.length === 0 ? (
          <p className="text-xs text-neutral-500">No simulated transactions recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {cohortTxs.slice(0, 20).map((tx) => {
              const isOpen = expandedTxSig === tx.signature;
              return (
                <div
                  key={tx.signature}
                  className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                          tx.status === 'SUCCESS'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {tx.status}
                      </span>
                      <span className="rounded bg-neutral-200 px-2 py-0.5 font-mono text-[10px] font-semibold dark:bg-neutral-800">
                        {tx.instruction}
                      </span>
                      <span className="font-medium">{tx.summary}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedTxSig(isOpen ? null : tx.signature)}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {tx.signature.slice(0, 12)}...
                      {isOpen ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {isOpen && (
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-950 p-3 font-mono text-[11px] text-emerald-300">
                      {JSON.stringify(
                        {
                          signature: tx.signature,
                          timestamp: tx.timestamp,
                          caller: tx.caller,
                          errorCode: tx.errorCode,
                          details: tx.details,
                        },
                        null,
                        2
                      )}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
