'use client';

import { create } from 'zustand';
import {
  ChainClient,
  ChainProgramError,
  CohortAccount,
  OracleAttestation,
  PersonaAccount,
  PersonaId,
  ScenarioPresetId,
  SecurityDemoRow,
  SimulatedTransactionLog,
  ValidatedCohortIntent,
  getChainClient,
  runScenarioPresetOnChain,
  runSecurityDemoOnChain,
} from '../chain';
import { ONE_USDC, formatUsdc } from '../economics';
import { resetOracleRateLimits } from '../oracle/grader';

export type ScreenTab =
  | 'home'
  | 'cohorts'
  | 'detail'
  | 'participant'
  | 'settle'
  | 'keeper'
  | 'security';

export interface KeeperLogEntry {
  id: string;
  timestamp: number;
  cohortId: string;
  action: 'SCAN' | 'SETTLE' | 'FINALIZE' | 'SKIP';
  message: string;
  txSignature?: string;
}

interface PagePledgeStoreState {
  chain: ChainClient;
  activePersona: PersonaId;
  selectedCohortId: string;
  selectedMilestoneIdx: number;
  activeScreen: ScreenTab;
  drawerOpen: boolean;

  // Mirrored reactive snapshots from ChainClient
  now: number;
  yieldAprBps: bigint;
  lenderLossBps: bigint;
  personas: PersonaAccount[];
  cohorts: CohortAccount[];
  transactions: SimulatedTransactionLog[];
  lastTx: SimulatedTransactionLog | null;

  // Keeper bot state
  keeperBotEnabled: boolean;
  keeperLogs: KeeperLogEntry[];

  // Security demo results
  securityDemoRows: SecurityDemoRow[];
  securityDemoCohortId: string | null;

  // Navigation & UI state setters
  syncFromChain: () => void;
  setActivePersona: (persona: PersonaId) => void;
  setSelectedCohortId: (cohortId: string) => void;
  setSelectedMilestoneIdx: (idx: number) => void;
  setActiveScreen: (screen: ScreenTab) => void;
  setDrawerOpen: (open: boolean) => void;
  clearLastTx: () => void;

  // ChainClient instruction wrappers (every state-changing action updates lastTx)
  createCohort: (intent: ValidatedCohortIntent) => Promise<CohortAccount>;
  startCohort: (cohortId: string) => Promise<CohortAccount>;
  joinCohort: (cohortId: string, user?: PersonaId) => Promise<CohortAccount>;
  commitSubmission: (
    cohortId: string,
    milestoneIdx: number,
    answerHash: string,
    answerText?: string
  ) => Promise<void>;
  completeMilestone: (
    cohortId: string,
    milestoneIdx: number,
    attestation: OracleAttestation
  ) => Promise<void>;
  recordFailedGrade: (cohortId: string, user: string, milestoneIdx: number, score: number) => void;
  settleUser: (cohortId: string, targetUser: string, caller?: string) => Promise<void>;
  finalizeCohort: (cohortId: string, caller?: string) => Promise<void>;
  claimPayout: (cohortId: string, user?: string) => Promise<bigint>;
  faucet: (user?: PersonaId, amountUsdc?: number) => Promise<void>;

  // Clock & economic simulation controls
  advanceClock: (deltaSeconds: number) => void;
  jumpToNextDeadline: () => void;
  jumpPastGrace: () => void;
  setYieldAprPercent: (aprPercent: number) => void;
  setLenderLossPercent: (lossPercent: number) => void;

  // Keeper bot & presets
  setKeeperBotEnabled: (enabled: boolean) => void;
  runKeeperSweepOnce: () => Promise<number>;
  runScenarioPreset: (preset: ScenarioPresetId) => Promise<CohortAccount>;
  runSecurityDemo: () => Promise<SecurityDemoRow[]>;
  resetAll: () => void;
}

const chainInstance = getChainClient();

export const usePagePledgeStore = create<PagePledgeStoreState>((set, get) => ({
  chain: chainInstance,
  activePersona: 'alice',
  selectedCohortId: chainInstance.getCohorts()[0]?.id ?? 'rust-ownership-101',
  selectedMilestoneIdx: 0,
  activeScreen: 'detail',
  drawerOpen: true,

  now: chainInstance.getNow(),
  yieldAprBps: chainInstance.getYieldAprBps(),
  lenderLossBps: chainInstance.getLenderLossBps(),
  personas: chainInstance.getPersonas(),
  cohorts: chainInstance.getCohorts(),
  transactions: chainInstance.getTransactions(),
  lastTx: chainInstance.getTransactions()[0] ?? null,

  keeperBotEnabled: false,
  keeperLogs: [],
  securityDemoRows: [],
  securityDemoCohortId: null,

  syncFromChain: () => {
    const { chain, selectedCohortId } = get();
    const cohorts = chain.getCohorts();
    const txs = chain.getTransactions();
    const validSelected =
      cohorts.find((c) => c.id === selectedCohortId)?.id ?? cohorts[0]?.id ?? '';
    set({
      now: chain.getNow(),
      yieldAprBps: chain.getYieldAprBps(),
      lenderLossBps: chain.getLenderLossBps(),
      personas: [...chain.getPersonas()],
      cohorts: [...cohorts],
      selectedCohortId: validSelected,
      transactions: [...txs],
      lastTx: txs[0] ?? null,
    });
  },

  setActivePersona: (activePersona) => set({ activePersona }),
  setSelectedCohortId: (selectedCohortId) => set({ selectedCohortId }),
  setSelectedMilestoneIdx: (selectedMilestoneIdx) => set({ selectedMilestoneIdx }),
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  clearLastTx: () => set({ lastTx: null }),

  createCohort: async (intent) => {
    const { chain, activePersona, syncFromChain } = get();
    try {
      const res = await chain.createCohort(activePersona, intent);
      syncFromChain();
      set({
        selectedCohortId: res.data.id,
        lastTx: res.tx,
        activeScreen: 'detail',
      });
      return res.data;
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  startCohort: async (cohortId) => {
    const { chain, activePersona, syncFromChain } = get();
    try {
      const res = await chain.startCohort(activePersona, cohortId);
      syncFromChain();
      set({ lastTx: res.tx });
      return res.data;
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  joinCohort: async (cohortId, user) => {
    const { chain, activePersona, syncFromChain } = get();
    const caller = user ?? activePersona;
    try {
      const res = await chain.join(caller, cohortId);
      syncFromChain();
      set({ lastTx: res.tx });
      return res.data;
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  commitSubmission: async (cohortId, milestoneIdx, answerHash, answerText) => {
    const { chain, activePersona, syncFromChain } = get();
    try {
      const res = await chain.commitSubmission(
        activePersona,
        cohortId,
        milestoneIdx,
        answerHash,
        answerText
      );
      syncFromChain();
      set({ lastTx: res.tx });
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  completeMilestone: async (cohortId, milestoneIdx, attestation) => {
    const { chain, activePersona, syncFromChain } = get();
    try {
      const res = await chain.completeMilestone(
        activePersona,
        cohortId,
        milestoneIdx,
        attestation
      );
      syncFromChain();
      set({ lastTx: res.tx });
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  recordFailedGrade: (cohortId, user, milestoneIdx, score) => {
    const { chain, syncFromChain } = get();
    chain.recordFailedGrade(cohortId, user, milestoneIdx, score);
    syncFromChain();
  },

  settleUser: async (cohortId, targetUser, caller) => {
    const { chain, activePersona, syncFromChain } = get();
    try {
      const res = await chain.settleUser(caller ?? activePersona, cohortId, targetUser);
      syncFromChain();
      set({ lastTx: res.tx });
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  finalizeCohort: async (cohortId, caller) => {
    const { chain, activePersona, syncFromChain } = get();
    try {
      const res = await chain.finalize(caller ?? activePersona, cohortId);
      syncFromChain();
      set({ lastTx: res.tx });
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  claimPayout: async (cohortId, user) => {
    const { chain, activePersona, syncFromChain } = get();
    try {
      const res = await chain.claim(user ?? activePersona, cohortId);
      syncFromChain();
      set({ lastTx: res.tx });
      return res.data.payout;
    } catch (err) {
      syncFromChain();
      throw err;
    }
  },

  faucet: async (user, amountUsdc = 500) => {
    const { chain, activePersona, syncFromChain } = get();
    const target = user ?? activePersona;
    const res = await chain.faucet(target, BigInt(amountUsdc) * ONE_USDC);
    syncFromChain();
    set({ lastTx: res.tx });
  },

  advanceClock: (deltaSeconds) => {
    const { chain, syncFromChain } = get();
    chain.advanceClock(deltaSeconds);
    syncFromChain();
  },

  jumpToNextDeadline: () => {
    const { chain, selectedCohortId, syncFromChain } = get();
    const cohort = chain.getCohort(selectedCohortId);
    const now = chain.getNow();
    if (!cohort) {
      chain.advanceClock(3600);
      syncFromChain();
      return;
    }
    const nextDeadline = cohort.deadlines.find((d) => d > now);
    if (nextDeadline !== undefined) {
      // Jump to 60 seconds after the next deadline so that milestone's commit window has closed
      chain.setClock(nextDeadline + 60);
    } else {
      chain.advanceClock(3600);
    }
    syncFromChain();
  },

  jumpPastGrace: () => {
    const { chain, selectedCohortId, syncFromChain } = get();
    const cohort = chain.getCohort(selectedCohortId);
    if (!cohort) {
      chain.advanceClock(86_400);
      syncFromChain();
      return;
    }
    const lastDeadline = cohort.deadlines[cohort.milestoneCount - 1];
    const settleTime = lastDeadline + cohort.gracePeriodSeconds + 60;
    chain.setClock(Math.max(chain.getNow() + 60, settleTime));
    syncFromChain();
  },

  setYieldAprPercent: (aprPercent) => {
    const { chain, syncFromChain } = get();
    const bps = BigInt(Math.max(0, Math.round(aprPercent * 100)));
    chain.setYieldAprBps(bps);
    syncFromChain();
  },

  setLenderLossPercent: (lossPercent) => {
    const { chain, syncFromChain } = get();
    const bps = BigInt(Math.max(0, Math.min(10000, Math.round(lossPercent * 100))));
    chain.setLenderLossBps(bps);
    syncFromChain();
  },

  setKeeperBotEnabled: (keeperBotEnabled) => set({ keeperBotEnabled }),

  runKeeperSweepOnce: async () => {
    const { chain, syncFromChain } = get();
    const cohorts = chain.getCohorts();
    const now = chain.getNow();
    const newLogs: KeeperLogEntry[] = [];
    let settledActions = 0;

    for (const cohort of cohorts) {
      const lastWindowClose =
        cohort.deadlines[cohort.milestoneCount - 1] + cohort.gracePeriodSeconds;

      if (now <= lastWindowClose) {
        newLogs.push({
          id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now,
          cohortId: cohort.id,
          action: 'SKIP',
          message: `[${cohort.title}] Window still open (closes in ${Math.max(0, lastWindowClose - now)}s). No special privileges—waiting for deadline + grace.`,
        });
        continue;
      }

      const unsettledUsers = Object.values(cohort.participants).filter((p) => !p.settled);
      for (const p of unsettledUsers) {
        try {
          // Keeper calls the exact same public ChainClient.settleUser path as any persona
          const res = await chain.settleUser('keeper', cohort.id, p.user);
          settledActions++;
          newLogs.push({
            id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: now,
            cohortId: cohort.id,
            action: 'SETTLE',
            message: `Settled ${p.user} on "${cohort.title}": ${res.data.missedCount} missed, forfeit ${formatUsdc(res.data.forfeit)}, earned bounty ${formatUsdc(res.data.bounty)}.`,
            txSignature: res.tx.signature,
          });
        } catch (err) {
          const msg = err instanceof ChainProgramError ? err.message : String(err);
          newLogs.push({
            id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: now,
            cohortId: cohort.id,
            action: 'SKIP',
            message: `Skipped ${p.user}: ${msg}`,
          });
        }
      }

      const refreshed = chain.getCohort(cohort.id);
      if (
        refreshed &&
        refreshed.status !== 'Finalized' &&
        Object.values(refreshed.participants).length > 0 &&
        Object.values(refreshed.participants).every((p) => p.settled)
      ) {
        try {
          const finRes = await chain.finalize('keeper', cohort.id);
          settledActions++;
          newLogs.push({
            id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: now,
            cohortId: cohort.id,
            action: 'FINALIZE',
            message: `All users settled in "${cohort.title}" -> called public finalize()! Reward pool: ${formatUsdc(finRes.data.pool)}.`,
            txSignature: finRes.tx.signature,
          });
        } catch {
          // Ignore if already finalized
        }
      }
    }

    syncFromChain();
    set((state) => ({
      keeperLogs: [...newLogs, ...state.keeperLogs].slice(0, 60),
    }));
    return settledActions;
  },

  runScenarioPreset: async (preset) => {
    const { chain, syncFromChain } = get();
    const cohort = await runScenarioPresetOnChain(chain, preset);
    syncFromChain();
    set({
      selectedCohortId: cohort.id,
      activeScreen: 'detail',
    });
    return cohort;
  },

  runSecurityDemo: async () => {
    const { chain, syncFromChain } = get();
    const { cohortId, rows } = await runSecurityDemoOnChain(chain);
    syncFromChain();
    set({
      securityDemoRows: rows,
      securityDemoCohortId: cohortId,
      selectedCohortId: cohortId,
      activeScreen: 'security',
    });
    return rows;
  },

  resetAll: () => {
    const { chain, syncFromChain } = get();
    resetOracleRateLimits();
    chain.resetState();
    syncFromChain();
    const firstId = chain.getCohorts()[0]?.id ?? 'rust-ownership-101';
    set({
      activePersona: 'alice',
      selectedCohortId: firstId,
      selectedMilestoneIdx: 0,
      keeperBotEnabled: false,
      keeperLogs: [],
      securityDemoRows: [],
      securityDemoCohortId: null,
      lastTx: null,
    });
  },
}));
