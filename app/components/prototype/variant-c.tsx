"use client";

import { useState, useEffect } from "react";
import { MOCK_COHORTS, CohortMock } from "./mock-data";

export function VariantC() {
  const [selectedCohort, setSelectedCohort] = useState<CohortMock>(MOCK_COHORTS[0]);
  const [activeTab, setActiveTab] = useState<"milestones" | "live-quiz" | "vault-rules">("milestones");
  const [audioRecording, setAudioRecording] = useState(false);
  const [timerSecs, setTimerSecs] = useState(600);
  const [audioTranscript, setAudioTranscript] = useState("");

  useEffect(() => {
    if (activeTab !== "live-quiz") return;
    const interval = setInterval(() => {
      setTimerSecs((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <div className="font-sans space-y-6 max-w-5xl mx-auto">
      {/* Top Banner: High-Stakes Financial Pledge Bar */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 via-neutral-900 to-neutral-950 p-6 border border-amber-500/30 flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-mono text-[10px] uppercase font-bold tracking-wider">
              High Stakes Commitment
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              Cohort: {selectedCohort.id}
            </span>
          </div>
          <h2 className="text-3xl font-black text-white mt-1">
            {selectedCohort.title}
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            {selectedCohort.depositSol} SOL Pledged • ${(selectedCohort.depositSol * 180).toFixed(0)} at risk if milestone missed
          </p>
        </div>

        {/* Circular radial countdown visual */}
        <div className="flex items-center gap-4 bg-neutral-950/80 px-5 py-3 rounded-2xl border border-neutral-800">
          <div className="w-12 h-12 rounded-full border-4 border-amber-500 border-t-neutral-700 flex items-center justify-center font-mono font-bold text-xs text-amber-400 animate-spin-slow">
            18m
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono text-neutral-400 block font-bold">
              Milestone 2 Deadline
            </span>
            <span className="text-sm font-bold text-white">
              18m 14s remaining
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <button
          onClick={() => setActiveTab("milestones")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === "milestones"
              ? "bg-foreground text-background"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          }`}
        >
          1. Milestone Schedule
        </button>
        <button
          onClick={() => setActiveTab("live-quiz")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "live-quiz"
              ? "bg-amber-500 text-neutral-950 shadow-xs"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          2. Live AI Oral & Citation Defense
        </button>
        <button
          onClick={() => setActiveTab("vault-rules")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === "vault-rules"
              ? "bg-foreground text-background"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          }`}
        >
          3. Payout Formula & Forfeitures
        </button>
      </div>

      {/* Tab 1: Milestones Flow */}
      {activeTab === "milestones" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((m) => (
            <div
              key={m}
              className={`p-5 rounded-2xl border transition-all ${
                m === 2
                  ? "border-amber-500 bg-amber-500/5 shadow-md"
                  : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 opacity-80"
              }`}
            >
              <div className="flex justify-between items-center text-xs font-mono mb-2">
                <span className="font-bold">Stage 0{m}</span>
                <span className={m === 1 ? "text-emerald-500" : m === 2 ? "text-amber-500" : "text-neutral-400"}>
                  {m === 1 ? "✓ Passed" : m === 2 ? "⚡ Current" : "Locked"}
                </span>
              </div>
              <h4 className="font-bold text-sm">
                {m === 1 ? "Anchor Fundamentals" : m === 2 ? "PDAs & Cross-Program Invocations" : "Full Stack Devnet Deploy"}
              </h4>
              <p className="text-xs text-neutral-500 mt-2">
                {m === 2 ? "Must submit proof before 18m timer expires or forfeit 0.625 SOL." : "Requires completing chapters 1-3."}
              </p>
              {m === 2 && (
                <button
                  onClick={() => setActiveTab("live-quiz")}
                  className="mt-4 w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase font-mono tracking-wider transition"
                >
                  Start Defense →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Multimodal / Oral Follow-up Prototype View (ADR 0008 anti-cheat) */}
      {activeTab === "live-quiz" && (
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-950 text-white p-8 space-y-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-widest">
                Adaptive Multimodal Defense
              </span>
              <h3 className="text-xl font-black mt-0.5">
                Oral & Synthesis Follow-Up Examination
              </h3>
            </div>
            <div className="font-mono text-xl font-bold bg-neutral-900 border border-neutral-700 px-4 py-1.5 rounded-xl text-amber-400">
              ⏱ {Math.floor(timerSecs / 60)}:{(timerSecs % 60).toString().padStart(2, "0")}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs text-neutral-300">
            <span className="font-bold text-amber-400 block mb-1">
              🎙 Anti-Cheat Challenge (ADR 0008):
            </span>
            The AI asks a spontaneous question derived from your written synthesis to verify authentic retention. You can speak or write the answer.
          </div>

          <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                AI
              </div>
              <p className="text-sm font-semibold text-neutral-100">
                &quot;In 30 seconds, explain how using Seeds with find_program_address prevents unauthorized signers from forging an account PDA.&quot;
              </p>
            </div>

            {/* Audio Recording / Voice verification prototype */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setAudioRecording(!audioRecording);
                  if (!audioRecording) {
                    setAudioTranscript("Deriving PDAs off-curve ensures no private key exists; only the program can sign with seeds...");
                  }
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
                  audioRecording
                    ? "bg-rose-500 text-white animate-pulse"
                    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                }`}
              >
                <span>{audioRecording ? "⏹ Stop Speaking" : "🎙 Record Voice Answer (15s)"}</span>
              </button>

              <span className="text-xs text-neutral-500">or type below</span>
            </div>

            {audioTranscript && (
              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-xs text-emerald-400">
                Transcript: &quot;{audioTranscript}&quot;
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => setActiveTab("milestones")}
              className="text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                alert("Voice & citations passed! Oracle Ed25519 signature generated.");
                setActiveTab("milestones");
              }}
              className="px-6 py-3 rounded-xl bg-emerald-500 text-neutral-950 font-bold font-mono text-xs uppercase tracking-wider hover:bg-emerald-400 transition cursor-pointer"
            >
              Verify Defense & Sign Attestation
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Payout Rule Visualizer (ADR 0006) */}
      {activeTab === "vault-rules" && (
        <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 space-y-4 text-xs">
          <h4 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 uppercase tracking-wide font-mono">
            On-Chain Payout Invariant (ADR 0006)
          </h4>
          <p className="text-neutral-500">
            Forfeitures accumulate in the Cohort Vault Reward Pool. Finishers receive their full pledge back + an equal split of the reward pool.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono">
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <span className="text-neutral-400 block text-[10px]">TOTAL VAULT PLEDGED</span>
              <span className="text-lg font-bold text-neutral-900 dark:text-neutral-100">15.0 SOL</span>
            </div>
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-rose-500 block text-[10px]">FORFEITURE POOL (1 Miss)</span>
              <span className="text-lg font-bold text-rose-500">0.625 SOL</span>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-emerald-500 block text-[10px]">ESTIMATED FINISHER REWARD</span>
              <span className="text-lg font-bold text-emerald-500">+0.125 SOL</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
