"use client";

import { useState, useEffect } from "react";
import { MOCK_COHORTS, MOCK_QUIZ_QUESTIONS, CohortMock } from "./mock-data";

export function VariantA() {
  const [selectedCohort, setSelectedCohort] = useState<CohortMock>(MOCK_COHORTS[0]);
  const [inQuiz, setInQuiz] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(600); // 10 min
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [quotes, setQuotes] = useState<{ [key: number]: string }>({});
  const [followUp, setFollowUp] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [quizResult, setQuizResult] = useState<"pass" | "fail" | null>(null);

  // Timer simulation
  useEffect(() => {
    if (!inQuiz || quizResult !== null) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [inQuiz, quizResult]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStartQuiz = (cohort: CohortMock) => {
    setSelectedCohort(cohort);
    setInQuiz(true);
    setSecondsLeft(600);
    setQuizResult(null);
    setFollowUp("");
  };

  const handleSubmitQuiz = () => {
    setEvaluating(true);
    setTimeout(() => {
      setEvaluating(false);
      setQuizResult("pass"); // Attestation signed
    }, 2000);
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Top Banner: Multi-cohort pledge summary */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-wider font-mono text-emerald-500 font-bold">
            Active Multi-Cohort Stake
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight mt-1">
            4.00 <span className="text-lg font-normal text-muted">SOL Total Committed</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            2 active commitments • Next milestone due in <span className="text-amber-500 font-semibold font-mono">18m 20s</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-foreground text-background hover:opacity-90 transition">
            + Create Cohort
          </button>
          <button className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
            Explore All
          </button>
        </div>
      </div>

      {!inQuiz ? (
        /* Cohort Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_COHORTS.map((cohort) => {
            const isDueSoon = cohort.status === "active";
            return (
              <div
                key={cohort.id}
                className="group relative rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 flex flex-col justify-between shadow-xs hover:border-amber-500/50 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-2">
                    <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 uppercase text-[10px] font-semibold text-neutral-600 dark:text-neutral-300">
                      {cohort.status}
                    </span>
                    <span>{cohort.membersCount} Peers</span>
                  </div>

                  <h3 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 group-hover:text-amber-500 transition-colors">
                    {cohort.title}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                    {cohort.bookOrTopic}
                  </p>

                  <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-900 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">My Pledge</span>
                      <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                        {cohort.depositSol} SOL
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">Cohort Vault Pool</span>
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">
                        {cohort.totalPledgedSol} SOL
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">Progress</span>
                      <span className="font-mono font-medium">
                        {cohort.currentMilestoneIndex} / {cohort.totalMilestones} Milestones
                      </span>
                    </div>
                  </div>

                  {/* Milestone status indicator */}
                  <div className="mt-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800/60 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{cohort.nextMilestoneTitle}</span>
                    </div>
                    {cohort.status === "active" && (
                      <div className="mt-1 flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-mono text-[11px]">
                        <span>⏳ Due in 18 min</span>
                        <span>•</span>
                        <span>Forfeit: {(cohort.forfeitBps / 100).toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-2">
                  {cohort.status === "active" ? (
                    <button
                      onClick={() => handleStartQuiz(cohort)}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm shadow-amber-500/20"
                    >
                      Take AI Milestone Quiz (Attempt 1/3)
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-neutral-400 text-xs font-semibold"
                    >
                      Milestones Completed
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Quiz Flow Modal/Overlay in Variant A */
        <div className="rounded-3xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-8 shadow-2xl relative">
          {/* Top Bar with sticky 10-min countdown timer */}
          <div className="flex items-center justify-between pb-6 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <span className="text-xs uppercase font-mono tracking-wider text-amber-500 font-bold">
                {selectedCohort.title} • Milestone {selectedCohort.currentMilestoneIndex}
              </span>
              <h2 className="text-2xl font-black mt-1">AI Comprehension & Citation Verification</h2>
              <p className="text-xs text-neutral-500">
                Attempt {attempt} of 3 • Passing requires ≥70% + valid textual citations
              </p>
            </div>

            {/* The Timer Pill */}
            <div className="flex items-center gap-3 bg-neutral-100 dark:bg-neutral-900 px-4 py-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 font-mono">
              <span className="text-xs text-neutral-400">Quiz Timer</span>
              <span
                className={`text-2xl font-black tracking-tight ${
                  secondsLeft < 120 ? "text-rose-500 animate-pulse" : "text-amber-500"
                }`}
              >
                {formatTime(secondsLeft)}
              </span>
            </div>
          </div>

          {/* Assigned Material Reference Drawer */}
          <div className="my-6 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs">
            <div className="font-semibold text-amber-600 dark:text-amber-400 mb-1 flex items-center justify-between">
              <span>📖 Milestone Assigned Material Snippet (Hash: 8a9f...3e01)</span>
              <span className="font-mono text-[10px] text-neutral-400">On-Chain Verified</span>
            </div>
            <p className="text-neutral-700 dark:text-neutral-300 italic leading-relaxed">
              &quot;{selectedCohort.materialSnippet}&quot;
            </p>
          </div>

          {/* Questions List */}
          {quizResult === null ? (
            <div className="space-y-6">
              {MOCK_QUIZ_QUESTIONS.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                      {q.question}
                    </h4>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                      Your Conceptual Explanation
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Explain your understanding..."
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex justify-between">
                      <span>Direct Quote Citation from Source Text</span>
                      <span className="font-normal lowercase font-mono text-neutral-400">
                        {q.hintCitation}
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="Paste exact excerpt here..."
                      value={quotes[q.id] || ""}
                      onChange={(e) => setQuotes({ ...quotes, [q.id]: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                </div>
              ))}

              {/* Real-time AI Follow-up (Anti-cheat mitigation from ADR 0008) */}
              <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 font-mono text-[10px] font-bold uppercase">
                  Adaptive AI Follow-Up (ADR 0008)
                </span>
                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  &quot;Based on your previous sentence, why would this check fail if the program ID is spoofed?&quot;
                </p>
                <input
                  type="text"
                  placeholder="Quick 1-sentence response..."
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={() => setInQuiz(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition"
                >
                  Cancel & Exit
                </button>

                <button
                  disabled={evaluating}
                  onClick={handleSubmitQuiz}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-md disabled:opacity-50"
                >
                  {evaluating ? "AI Oracle Evaluating..." : "Submit for Oracle Attestation"}
                </button>
              </div>
            </div>
          ) : (
            /* Pass Screen: Ed25519 Attestation Ready */
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto text-3xl font-bold">
                ✓
              </div>
              <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100">
                AI Evaluator Grade: 92% (Passed)
              </h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                The oracle key has signed your milestone completion attestation. Submit the transaction to record on Solana!
              </p>
              <div className="p-4 rounded-xl bg-neutral-100 dark:bg-neutral-900 max-w-md mx-auto text-left font-mono text-[10px] text-neutral-400 break-all border border-neutral-200 dark:border-neutral-800">
                Ed25519 Sig: 5K8s...9b1Z (Cohort: {selectedCohort.id}, Milestone: 2)
              </div>
              <div className="flex justify-center gap-3 pt-4">
                <button
                  onClick={() => setInQuiz(false)}
                  className="px-6 py-2.5 rounded-xl bg-foreground text-background font-bold text-xs uppercase tracking-wider"
                >
                  Broadcast On-Chain via Precompile
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
