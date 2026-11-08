"use client";

import { useState, useEffect } from "react";
import { MOCK_COHORTS, MOCK_QUIZ_QUESTIONS, CohortMock } from "./mock-data";

export function WinningUnifiedFlow() {
  const [selectedCohort, setSelectedCohort] = useState<CohortMock>(
    MOCK_COHORTS[0]
  );
  const [inQuiz, setInQuiz] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(600); // 10 mins
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [quotes, setQuotes] = useState<{ [key: number]: string }>({});
  const [adaptiveAnswer, setAdaptiveAnswer] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [quizResult, setQuizResult] = useState<"pass" | "fail" | null>(null);

  // Timer countdown
  useEffect(() => {
    if (!inQuiz || quizResult !== null) return;
    const interval = setInterval(() => {
      setSecondsRemaining((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [inQuiz, quizResult]);

  const handleStartQuiz = (cohort: CohortMock) => {
    setSelectedCohort(cohort);
    setInQuiz(true);
    setSecondsRemaining(600);
    setCurrentQuestionIdx(0);
    setQuizResult(null);
    setAdaptiveAnswer("");
  };

  const handleCompleteDefense = () => {
    setEvaluating(true);
    setTimeout(() => {
      setEvaluating(false);
      setQuizResult("pass");
    }, 1800);
  };

  const currentQ = MOCK_QUIZ_QUESTIONS[currentQuestionIdx];
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerPercentage = ((600 - secondsRemaining) / 600) * 100;

  return (
    <div className="space-y-8 font-sans">
      {/* 1. VARIANT A'S CARD GRID & MULTI-COHORT PLEDGE BANNER */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-wider font-mono text-emerald-500 font-bold">
            Multi-Cohort Active Commitments
          </span>
          <h2 className="text-3xl font-black tracking-tight mt-1">
            4.00{" "}
            <span className="text-lg font-normal text-muted">
              SOL Total Staked
            </span>
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            2 active cohorts • Next milestone due in{" "}
            <span className="text-amber-500 font-semibold font-mono">
              18m 14s
            </span>
          </p>
        </div>

        <div className="flex gap-2.5">
          <button className="px-4 py-2 text-xs font-semibold rounded-xl bg-foreground text-background hover:opacity-90 transition">
            + Create Cohort
          </button>
          <button className="px-4 py-2 text-xs font-semibold rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
            Explore All
          </button>
        </div>
      </div>

      {!inQuiz ? (
        /* Cohort Cards Grid (Variant A) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_COHORTS.map((cohort) => {
            const isActive = cohort.status === "active";
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
                    <span>{cohort.membersCount} Participants</span>
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
                      <span className="text-neutral-500">
                        Cohort Vault Pool
                      </span>
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">
                        {cohort.totalPledgedSol} SOL
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">Progress</span>
                      <span className="font-mono font-medium">
                        {cohort.currentMilestoneIndex} /{" "}
                        {cohort.totalMilestones} Milestones
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800/60 text-xs">
                    <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {cohort.nextMilestoneTitle}
                    </div>
                    {isActive && (
                      <div className="mt-1 flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-mono text-[11px]">
                        <span>⏳ Due in 18 min</span>
                        <span>•</span>
                        <span>
                          Penalty: {(cohort.forfeitBps / 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-2">
                  {isActive ? (
                    <button
                      onClick={() => handleStartQuiz(cohort)}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm shadow-amber-500/20"
                    >
                      Enter Defense & Quiz (Attempt 1/3)
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
        /* 2. SPLIT-SCREEN EXAMINER TERMINAL (VARIANT B) + RADIAL COUNTDOWN (VARIANT C) + MODAL/OVERLAY */
        <div className="rounded-3xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-6 md:p-8 shadow-2xl space-y-6">
          {/* Top Bar with Radial Countdown Timer (Variant C) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                  Adaptive AI Defense (ADR 0008)
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {selectedCohort.id}
                </span>
              </div>
              <h2 className="text-2xl font-black text-neutral-900 dark:text-white mt-1">
                {selectedCohort.title} • Milestone{" "}
                {selectedCohort.currentMilestoneIndex}
              </h2>
              <p className="text-xs text-neutral-500">
                Question {currentQuestionIdx + 1} of{" "}
                {MOCK_QUIZ_QUESTIONS.length} • Verifying conceptual depth &
                exact citations
              </p>
            </div>

            {/* Radial Countdown Timer (Variant C) */}
            <div className="flex items-center gap-4 bg-neutral-100 dark:bg-neutral-900/80 px-5 py-3 rounded-2xl border border-neutral-200 dark:border-neutral-800">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg
                  className="w-12 h-12 -rotate-90 transform"
                  viewBox="0 0 36 36"
                >
                  <path
                    className="text-neutral-300 dark:text-neutral-800"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={
                      secondsRemaining < 120
                        ? "text-rose-500 animate-pulse"
                        : "text-amber-500"
                    }
                    strokeDasharray={`${timerPercentage}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute font-mono text-xs font-bold text-neutral-900 dark:text-white">
                  {minutes}m
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-neutral-400 block font-bold">
                  Time Remaining
                </span>
                <span className="text-sm font-bold font-mono text-neutral-900 dark:text-white">
                  {minutes.toString().padStart(2, "0")}:
                  {seconds.toString().padStart(2, "0")}
                </span>
              </div>
            </div>
          </div>

          {quizResult === null ? (
            /* Split Screen Terminal Layout (Variant B) */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Assigned Source Material Citation Anchor (ADR 0003) */}
              <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 pb-3">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-500">
                    Source Material Anchor
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded">
                    SHA-256: 8a9f...3e01
                  </span>
                </div>

                <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-3 font-serif leading-relaxed">
                  <p className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 italic">
                    &quot;{selectedCohort.materialSnippet}&quot;
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Prompt Rule: Your answer must directly incorporate authentic
                    citations from the assigned text above. The AI Oracle
                    matches citations against this verified material hash.
                  </p>
                </div>

                {/* Adaptive Oral / Speech Defense Challenge (Variant C Anti-Cheat) */}
                <div className="mt-4 p-4 rounded-xl bg-neutral-900 text-white border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-amber-400 font-bold uppercase">
                      Adaptive Oral Defense (ADR 0008)
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <p className="text-xs text-neutral-300">
                    &quot;Explain in your own words why deriving accounts
                    off-curve prevents private key spoofing.&quot;
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRecording(!isRecording);
                        if (!isRecording) {
                          setAdaptiveAnswer(
                            "Off-curve addresses have no private key, so only the Anchor program's seeds can sign for the vault PDA."
                          );
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
                        isRecording
                          ? "bg-rose-500 text-white animate-pulse"
                          : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                      }`}
                    >
                      <span>
                        {isRecording
                          ? "⏹ Recording Voice..."
                          : "🎙 Record Oral Defense (20s)"}
                      </span>
                    </button>
                    <span className="text-[11px] text-neutral-500">
                      or type below
                    </span>
                  </div>

                  {adaptiveAnswer && (
                    <div className="p-2.5 rounded-lg bg-neutral-950 font-mono text-xs text-emerald-400 border border-neutral-800">
                      Transcript: &quot;{adaptiveAnswer}&quot;
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Dynamic Question & Citation Input */}
              <div className="space-y-4">
                <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-4">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                      {currentQuestionIdx + 1}
                    </span>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {currentQ.question}
                    </h4>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide block mb-1">
                      Your Conceptual Synthesis
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Explain your understanding..."
                      value={answers[currentQ.id] || ""}
                      onChange={(e) =>
                        setAnswers({
                          ...answers,
                          [currentQ.id]: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-3 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex justify-between mb-1">
                      <span>Direct Quote Citation</span>
                      <span className="font-mono text-neutral-400 lowercase font-normal">
                        {currentQ.hintCitation}
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="Paste exact quote here..."
                      value={quotes[currentQ.id] || ""}
                      onChange={(e) =>
                        setQuotes({ ...quotes, [currentQ.id]: e.target.value })
                      }
                      className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-2.5 text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                </div>

                {/* Bottom Navigation between questions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setInQuiz(false)}
                    className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition"
                  >
                    ← Exit Quiz
                  </button>

                  <div className="flex gap-3">
                    {currentQuestionIdx < MOCK_QUIZ_QUESTIONS.length - 1 ? (
                      <button
                        onClick={() => setCurrentQuestionIdx((i) => i + 1)}
                        className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider cursor-pointer shadow-xs"
                      >
                        Next Question →
                      </button>
                    ) : (
                      <button
                        disabled={evaluating}
                        onClick={handleCompleteDefense}
                        className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider cursor-pointer shadow-md disabled:opacity-50"
                      >
                        {evaluating
                          ? "AI Oracle Evaluating..."
                          : "Verify & Sign Attestation"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Pass Screen: Ed25519 Oracle Signature Verified */
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto text-3xl font-bold">
                ✓
              </div>
              <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100">
                Milestone Defense Verified: 94% Grade
              </h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Textual citations & adaptive follow-up passed. The Oracle key
                has authorized your Ed25519 completion payload.
              </p>
              <div className="p-4 rounded-xl bg-neutral-100 dark:bg-neutral-900 max-w-md mx-auto text-left font-mono text-[10px] text-neutral-400 break-all border border-neutral-200 dark:border-neutral-800">
                Ed25519 Signature: 4W9x...7yZ0 (Cohort: {selectedCohort.id},
                Milestone: 2)
              </div>
              <div className="flex justify-center gap-3 pt-4">
                <button
                  onClick={() => setInQuiz(false)}
                  className="px-6 py-2.5 rounded-xl bg-foreground text-background font-bold text-xs uppercase tracking-wider cursor-pointer hover:opacity-90"
                >
                  Broadcast On-Chain via Precompile (RecordCompletion)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
