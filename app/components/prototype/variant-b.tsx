"use client";

import { useState, useEffect } from "react";
import { MOCK_COHORTS, MOCK_QUIZ_QUESTIONS, CohortMock } from "./mock-data";

export function VariantB() {
  const [selectedCohort, setSelectedCohort] = useState<CohortMock>(
    MOCK_COHORTS[0]
  );
  const [activeStep, setActiveStep] = useState<"overview" | "quiz" | "settle">(
    "overview"
  );
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const [userAnswer, setUserAnswer] = useState("");
  const [userQuote, setUserQuote] = useState("");

  useEffect(() => {
    if (activeStep !== "quiz") return;
    const interval = setInterval(() => {
      setSecondsRemaining((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStep]);

  const currentQ = MOCK_QUIZ_QUESTIONS[currentQuestionIdx];

  return (
    <div className="flex flex-col lg:flex-row gap-6 font-sans">
      {/* Left Sidebar: Multi-Cohort Pledges List */}
      <aside className="w-full lg:w-80 shrink-0 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400">
            My Cohort Pledges
          </span>
          <span className="text-xs font-bold font-mono text-emerald-500">
            3 Active / 1 Done
          </span>
        </div>

        <div className="space-y-3">
          {MOCK_COHORTS.map((c) => {
            const isSelected = c.id === selectedCohort.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCohort(c);
                  setActiveStep("overview");
                }}
                className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "border-amber-500 bg-amber-500/5 shadow-xs"
                    : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:border-neutral-400"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span className="uppercase">{c.status}</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">
                    {c.depositSol} SOL
                  </span>
                </div>
                <h4 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 mt-1 line-clamp-1">
                  {c.title}
                </h4>
                <div className="mt-2 text-xs flex justify-between text-neutral-500">
                  <span>
                    Milestone {c.currentMilestoneIndex}/{c.totalMilestones}
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-mono">
                    18m left
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Permissionless Keeper / Settle Trigger Panel */}
        <div className="p-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 text-xs space-y-2">
          <div className="flex justify-between font-bold text-neutral-600 dark:text-neutral-400">
            <span>Permissionless Settlement</span>
            <span className="font-mono text-emerald-500">Keeper Idle</span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-tight">
            Anyone can trigger on-chain settlement after deadline + grace period
            passes.
          </p>
          <button className="w-full py-1.5 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 font-mono text-[11px] font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer">
            Trigger Settle(Milestone 1)
          </button>
        </div>
      </aside>

      {/* Main Workspace Stage */}
      <main className="flex-1 min-w-0">
        {activeStep === "overview" && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-neutral-900">
              <div>
                <span className="text-xs font-mono uppercase text-amber-500 font-bold">
                  Cohort Workspace
                </span>
                <h2 className="text-2xl font-black mt-0.5">
                  {selectedCohort.title}
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  {selectedCohort.bookOrTopic}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-neutral-400 font-mono">
                  My Vault Balance
                </span>
                <p className="text-2xl font-black font-mono text-emerald-500">
                  {selectedCohort.depositSol} SOL
                </p>
              </div>
            </div>

            {/* Linear Milestones Flow */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono uppercase text-neutral-400 font-bold">
                Milestone Progress & Deadlines
              </h4>
              <div className="space-y-2">
                {[1, 2, 3, 4].map((idx) => {
                  const isCurrent =
                    idx === selectedCohort.currentMilestoneIndex;
                  const isDone = idx < selectedCohort.currentMilestoneIndex;
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
                        isCurrent
                          ? "border-amber-500 bg-amber-500/5 font-semibold"
                          : isDone
                            ? "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/30 text-neutral-400"
                            : "border-neutral-200 dark:border-neutral-800 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold bg-neutral-200 dark:bg-neutral-800 text-[11px]">
                          {isDone ? "✓" : idx}
                        </span>
                        <div>
                          <div className="font-bold text-neutral-900 dark:text-neutral-100">
                            Milestone {idx}: Chapters {idx * 2 - 1}-{idx * 2}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-normal">
                            {isCurrent
                              ? "⏳ Deadline: 18 minutes remaining"
                              : isDone
                                ? "Passed & Signed On-Chain"
                                : "Upcoming"}
                          </div>
                        </div>
                      </div>

                      <div>
                        {isCurrent && (
                          <button
                            onClick={() => {
                              setActiveStep("quiz");
                              setCurrentQuestionIdx(0);
                            }}
                            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold font-mono text-xs cursor-pointer shadow-xs"
                          >
                            Enter AI Test Terminal →
                          </button>
                        )}
                        {isDone && (
                          <span className="font-mono text-emerald-500 font-bold">
                            Attested
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step-by-Step AI Quiz Terminal */}
        {activeStep === "quiz" && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-950 text-neutral-100 p-6 font-mono space-y-6 shadow-2xl">
            {/* Top Terminal HUD */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <span className="text-amber-400 text-xs uppercase font-bold">
                  Terminal Step {currentQuestionIdx + 1} of{" "}
                  {MOCK_QUIZ_QUESTIONS.length}
                </span>
                <h3 className="text-lg font-bold text-white">
                  AI Milestone Examiner
                </h3>
              </div>

              {/* Countdown badge */}
              <div className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-amber-400 text-xl font-bold">
                ⏱ {Math.floor(secondsRemaining / 60)}:
                {(secondsRemaining % 60).toString().padStart(2, "0")}
              </div>
            </div>

            {/* Split Screen in Variant B: Material Quote Anchor vs Response Input */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                  Reference Material Text (Hash: 8a9f...3e01)
                </span>
                <p className="text-neutral-300 italic leading-relaxed text-xs">
                  &quot;{selectedCohort.materialSnippet}&quot;
                </p>
                <span className="text-[10px] text-amber-400 block pt-2">
                  Requirement: Quote must be cited verbatim from this text
                  block.
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-white mb-2">
                    {currentQ.question}
                  </h4>
                  <textarea
                    rows={4}
                    placeholder="Enter analytical synthesis..."
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-xs text-white focus:border-amber-400 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider block mb-1">
                    Direct Textual Citation
                  </label>
                  <input
                    type="text"
                    placeholder="Exact quote..."
                    value={userQuote}
                    onChange={(e) => setUserQuote(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-xs text-amber-300 focus:border-amber-400 outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Navigation Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
              <button
                onClick={() => setActiveStep("overview")}
                className="text-xs text-neutral-400 hover:text-white"
              >
                ← Abandon Test (Consumes Attempt)
              </button>

              <div className="flex gap-3">
                {currentQuestionIdx < MOCK_QUIZ_QUESTIONS.length - 1 ? (
                  <button
                    onClick={() => setCurrentQuestionIdx((i) => i + 1)}
                    className="px-4 py-2 rounded-lg bg-amber-500 text-neutral-950 font-bold text-xs uppercase cursor-pointer"
                  >
                    Next Question →
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      alert(
                        "Oracle Attestation Signed! Ed25519 payload created."
                      );
                      setActiveStep("overview");
                    }}
                    className="px-5 py-2 rounded-lg bg-emerald-500 text-neutral-950 font-bold text-xs uppercase cursor-pointer"
                  >
                    Submit All for Evaluation
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
