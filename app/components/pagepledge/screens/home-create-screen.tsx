'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { CohortAccount, CohortStatus } from '@/lib/chain';
import { formatUsdc } from '@/lib/economics';
import {
  EXAMPLE_INTENT_CHIPS,
  IntentParseResult,
  buildTermsPreview,
  parseIntentHeuristically,
} from '@/lib/intent/parser';
import { usePagePledgeStore } from '@/lib/store/use-pagepledge-store';

function statusBadgeStyle(status: CohortStatus): string {
  switch (status) {
    case 'Open':
      return 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300';
    case 'Active':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300';
    case 'Settling':
      return 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300';
    case 'Finalized':
      return 'bg-purple-500/15 text-purple-700 border-purple-500/30 dark:text-purple-300';
  }
}

function formatCountdown(targetUnix: number, nowUnix: number): string {
  const diff = targetUnix - nowUnix;
  if (diff <= 0) return 'Window closed';
  const days = Math.floor(diff / 86_400);
  const hours = Math.floor((diff % 86_400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m ${secs}s remaining`;
}

export function HomeCreateAndCohortsScreen() {
  const {
    cohorts,
    now,
    activePersona,
    selectedCohortId,
    setSelectedCohortId,
    setActiveScreen,
    createCohort,
    joinCohort,
    startCohort,
  } = usePagePledgeStore();

  const [prompt, setPrompt] = useState(EXAMPLE_INTENT_CHIPS[0].prompt);
  const [demoFastMode, setDemoFastMode] = useState(false);
  const [loadingParse, setLoadingParse] = useState(false);
  const [parseResult, setParseResult] = useState<IntentParseResult | null>(() => {
    const initial = parseIntentHeuristically(EXAMPLE_INTENT_CHIPS[0].prompt);
    return initial;
  });

  const handleParsePrompt = async (customPrompt?: string, fastOverride?: boolean) => {
    const textToParse = customPrompt ?? prompt;
    const isFast = fastOverride ?? demoFastMode;
    setLoadingParse(true);
    try {
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToParse, demoFastMode: isFast }),
      });
      const data = (await res.json()) as IntentParseResult;
      setParseResult(data);
      if (!data.ok) {
        toast.error(data.error ?? 'Intent rejected by strict schema');
      } else {
        toast.success('Parsed & validated cohort terms!');
      }
    } catch {
      const fallback = parseIntentHeuristically(textToParse);
      if (fallback.ok && fallback.intent) {
        fallback.terms = buildTermsPreview(fallback.intent, isFast);
      }
      setParseResult(fallback);
    } finally {
      setLoadingParse(false);
    }
  };

  const handleToggleFastMode = (checked: boolean) => {
    setDemoFastMode(checked);
    if (parseResult?.ok && parseResult.intent) {
      setParseResult({
        ...parseResult,
        terms: buildTermsPreview(parseResult.intent, checked),
      });
    }
  };

  const handleConfirmCreate = async (autoPopulateThreePersonas: boolean = false) => {
    if (!parseResult?.ok || !parseResult.intent) return;
    try {
      const cohort = await createCohort({
        ...parseResult.intent,
        demoFastMode,
      });
      if (autoPopulateThreePersonas) {
        await joinCohort(cohort.id, 'alice');
        await joinCohort(cohort.id, 'bob');
        await joinCohort(cohort.id, 'carol');
        await startCohort(cohort.id);
        toast.success(
          `Created "${cohort.title}", joined Alice/Bob/Carol, and started cohort!`
        );
      } else {
        toast.success(`Cohort "${cohort.title}" created in Open state!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create cohort');
    }
  };

  const handleQuickJoin = async (cohort: CohortAccount) => {
    try {
      await joinCohort(cohort.id, activePersona);
      toast.success(`${activePersona} staked ${formatUsdc(cohort.stake)} and joined "${cohort.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join cohort');
    }
  };

  const handleQuickStart = async (cohort: CohortAccount) => {
    try {
      await startCohort(cohort.id);
      toast.success(`Cohort "${cohort.title}" is now Active!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start cohort');
    }
  };

  return (
    <div className="space-y-8">
      {/* Screen 1: Natural-Language Cohort Creation */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-lg font-bold tracking-tight">
                Natural-Language Cohort Creation
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Describe your reading cohort in plain English. Validated by a{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] dark:bg-neutral-800">
                .strict()
              </code>{' '}
              Zod schema before reaching <code className="font-mono text-[11px]">ChainClient.createCohort</code>.
            </p>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <input
              type="checkbox"
              checked={demoFastMode}
              onChange={(e) => handleToggleFastMode(e.target.checked)}
              className="rounded accent-amber-600"
            />
            <Zap className="h-3.5 w-3.5" />
            Demo Fast Mode (2m milestones / 1m grace)
          </label>
        </div>

        {/* Example Chips */}
        <div className="mb-3 flex flex-wrap gap-2">
          {EXAMPLE_INTENT_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setPrompt(chip.prompt);
                handleParsePrompt(chip.prompt, demoFastMode);
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                chip.isUnsupportedDemo
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Create a 14-day Rust Ownership cohort with 4 milestones, 100 USDC stake, and max 10 participants."
            className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 p-3 text-sm focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="button"
            disabled={loadingParse}
            onClick={() => handleParsePrompt()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {loadingParse ? 'Parsing...' : 'Parse & Preview Terms'}
          </button>
        </div>

        {/* Rejection / Error Card */}
        {parseResult && !parseResult.ok && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-900 dark:text-rose-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div>
                <h3 className="text-sm font-bold">
                  Intent Rejected by Protocol Guardrails
                </h3>
                <p className="mt-1 text-xs leading-relaxed">{parseResult.error}</p>
                <p className="mt-2 font-mono text-[11px] opacity-80">
                  The AI parser never emits raw Solana instructions or custom fee overrides. Only validated{' '}
                  <code>CohortIntentSchema.strict()</code> parameters are accepted.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Human-Readable Validated Terms Card */}
        {parseResult?.ok && parseResult.terms && (
          <div className="mt-5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Human-Readable Cohort Terms Card
                </span>
                <h3 className="text-base font-bold">{parseResult.terms.intent.title}</h3>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {parseResult.terms.validationBadges.map((b) => (
                  <span
                    key={b.label}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-neutral-500">Stake per Participant (S_i)</div>
                <div className="mt-1 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {parseResult.terms.stakeFormatted}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-400">
                  Max {parseResult.terms.intent.maxParticipants} participants
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-neutral-500">Milestones & Forfeit per Miss</div>
                <div className="mt-1 font-mono text-sm font-bold">
                  {parseResult.terms.forfeitPerMissFraction}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-400">
                  {parseResult.terms.intent.milestoneCount} milestones over{' '}
                  {parseResult.terms.intent.durationDays} days
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-neutral-500">Protocol Fee & Settle Bounty</div>
                <div className="mt-1 font-mono text-sm font-bold">
                  {parseResult.terms.protocolFeeFormatted}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-400">
                  Caller settle bounty: min(1% forfeit, 1 USDC)
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-neutral-500">Grace Window & Oracle Pubkey</div>
                <div className="mt-1 font-mono text-xs font-bold">
                  {parseResult.terms.gracePeriodFormatted}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-neutral-400">
                  Oracle: {parseResult.terms.oraclePubkeyHex.slice(0, 20)}...
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-neutral-500">Deadlines:</span>
                {parseResult.terms.deadlinesPreview.map((d) => (
                  <span
                    key={d}
                    className="rounded bg-neutral-200/70 px-2 py-0.5 font-mono text-[11px] dark:bg-neutral-800"
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmCreate(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-4 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:bg-neutral-900 dark:text-emerald-300"
                >
                  <PlusCircle className="h-4 w-4" />
                  Confirm & Create (Open)
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmCreate(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Confirm + Auto-Join 3 Personas & Start
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Screen 2: Cohorts List */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Cohorts Directory</h2>
            <p className="text-xs text-neutral-500">
              All cohorts persisted in localStorage under{' '}
              <code className="font-mono text-[11px]">pagepledge_mockchain_v1</code>.
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 font-mono text-xs font-semibold dark:bg-neutral-800">
            {cohorts.length} Cohort{cohorts.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cohorts.map((cohort) => {
            const pCount = Object.keys(cohort.participants).length;
            const isJoined = Boolean(cohort.participants[activePersona]);
            const nextDeadline =
              cohort.deadlines.find((d) => d > now) ??
              cohort.deadlines[cohort.milestoneCount - 1];
            const isSelected = cohort.id === selectedCohortId;

            return (
              <div
                key={cohort.id}
                className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/5 dark:border-indigo-400'
                    : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold">{cohort.title}</h3>
                      <p className="mt-0.5 font-mono text-[11px] text-neutral-400">
                        id: {cohort.id} • epoch: {cohort.epoch}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadgeStyle(
                        cohort.status
                      )}`}
                    >
                      {cohort.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {cohort.description}
                  </p>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-neutral-50 p-2.5 text-xs dark:bg-neutral-950">
                    <div>
                      <div className="text-[10px] text-neutral-400">Stake</div>
                      <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatUsdc(cohort.stake)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400">Participants</div>
                      <div className="flex items-center gap-1 font-mono font-bold">
                        <Users className="h-3 w-3 text-neutral-400" />
                        {pCount} / {cohort.maxParticipants}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400">Milestones</div>
                      <div className="flex items-center gap-1 font-mono font-bold">
                        <Layers className="h-3 w-3 text-neutral-400" />
                        {cohort.milestoneCount} checks
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <span className="flex items-center gap-1 font-mono text-[11px] text-neutral-500">
                    <Clock className="h-3 w-3" />
                    {cohort.status === 'Finalized'
                      ? 'Finalized'
                      : formatCountdown(nextDeadline, now)}
                  </span>

                  <div className="flex items-center gap-2">
                    {cohort.status === 'Open' && !isJoined && (
                      <button
                        type="button"
                        onClick={() => handleQuickJoin(cohort)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        Join as {activePersona}
                      </button>
                    )}
                    {cohort.status === 'Open' && pCount >= 2 && (
                      <button
                        type="button"
                        onClick={() => handleQuickStart(cohort)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        Start Cohort
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCohortId(cohort.id);
                        setActiveScreen('detail');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      Open Cohort
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
