import {
  BPS_DENOMINATOR,
  EconomicsResult,
  LAMPORTS_PER_SOL,
  MilestoneOutcome,
  computeCohortEconomics,
  computeForfeit,
  computeLenderLoss,
  computeSettleBounty,
  computeSimulatedYield,
  formatSol,
  parseSolToLamports,
} from "../economics";
import {
  getDemoOracleKeypair,
  hashAnswerText,
  verifyAttestation,
} from "./attestation";
import {
  ChainClient,
  ChainErrorCode,
  ChainProgramError,
  CohortAccount,
  MilestoneCommitRecord,
  OracleAttestation,
  ParticipantState,
  PersonaAccount,
  SimulatedTransactionLog,
  TxResult,
  ValidatedCohortIntent,
} from "./types";

export const STORAGE_KEY = "pagepledge_mockchain_v1";
export const DEFAULT_PROGRAM_ID = "PgP1edg3Vau1t111111111111111111111111111111";
export const DEFAULT_CLUSTER_ID = "devnet";
export const DEFAULT_CONTENT_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
export const MAX_COMMIT_ATTEMPTS = 3;

interface MockChainState {
  version: 2;
  now: number; // simulated unix timestamp (seconds)
  yieldAprBps: bigint; // default 500n (5.00% APR)
  lenderLossBps: bigint; // default 0n (0.00% loss)
  personas: Record<string, PersonaAccount>;
  cohorts: Record<string, CohortAccount>;
  transactions: SimulatedTransactionLog[];
  txCounter: number;
}

function serializeWithBigInt(state: MockChainState): string {
  return JSON.stringify(state, (_key, value) =>
    typeof value === "bigint" ? { __bigint__: value.toString() } : value
  );
}

function deserializeWithBigInt(raw: string): MockChainState {
  return JSON.parse(raw, (_key, value) => {
    if (
      value &&
      typeof value === "object" &&
      "__bigint__" in value &&
      typeof (value as { __bigint__: unknown }).__bigint__ === "string"
    ) {
      return BigInt((value as { __bigint__: string }).__bigint__);
    }
    return value;
  }) as MockChainState;
}

export function createInitialPersonas(): Record<string, PersonaAccount> {
  return {
    alice: {
      id: "alice",
      name: "Alice (Finisher)",
      role: "Diligent Participant",
      pubkey: "A1ice11111111111111111111111111111111111111",
      lamportsBalance: 10n * LAMPORTS_PER_SOL,
    },
    bob: {
      id: "bob",
      name: "Bob (Slacker)",
      role: "Partial Dropout",
      pubkey: "B0b1111111111111111111111111111111111111111",
      lamportsBalance: 10n * LAMPORTS_PER_SOL,
    },
    carol: {
      id: "carol",
      name: "Carol (Unattested)",
      role: "Commits But Unattested",
      pubkey: "Car0111111111111111111111111111111111111111",
      lamportsBalance: 10n * LAMPORTS_PER_SOL,
    },
    dave: {
      id: "dave",
      name: "Dave (Latecomer)",
      role: "Extra Participant",
      pubkey: "Dav3111111111111111111111111111111111111111",
      lamportsBalance: 10n * LAMPORTS_PER_SOL,
    },
    keeper: {
      id: "keeper",
      name: "Keeper Bot",
      role: "Permissionless Sweeper",
      pubkey: "K33p3r1111111111111111111111111111111111111",
      lamportsBalance: 10n * LAMPORTS_PER_SOL,
    },
    creator: {
      id: "creator",
      name: "Creator (Host)",
      role: "Cohort Organizer",
      pubkey: "Cr3at0r111111111111111111111111111111111111",
      lamportsBalance: 10n * LAMPORTS_PER_SOL,
    },
  };
}

export interface MockChainOptions {
  initialNow?: number;
  persist?: boolean;
  seedDemoCohort?: boolean;
}

export class MockChain implements ChainClient {
  public readonly mode = "mock" as const;
  private state: MockChainState;
  private readonly persistEnabled: boolean;
  private readonly initialNow: number;
  private readonly seedDemoCohort: boolean;
  private listeners: Set<() => void> = new Set();

  constructor(options: MockChainOptions = {}) {
    this.persistEnabled =
      options.persist ??
      (typeof window !== "undefined" &&
        typeof window.localStorage !== "undefined");
    this.initialNow = options.initialNow ?? 1_762_516_800; // Fixed deterministic base epoch if needed
    this.seedDemoCohort = options.seedDemoCohort ?? false;
    this.state = this.loadOrInitState();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.saveState();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private loadOrInitState(): MockChainState {
    if (this.persistEnabled && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = deserializeWithBigInt(raw);
          if (parsed && parsed.version === 2) {
            return parsed;
          }
        }
      } catch {
        // Fallback to fresh state if corrupted
      }
    }
    return this.buildFreshState();
  }

  private buildFreshState(): MockChainState {
    const fresh: MockChainState = {
      version: 2,
      now: this.initialNow,
      yieldAprBps: 500n, // 5.00% default APR
      lenderLossBps: 0n,
      personas: createInitialPersonas(),
      cohorts: {},
      transactions: [],
      txCounter: 1,
    };

    if (this.seedDemoCohort) {
      // Seed one default Rust Ownership cohort so the UI is populated out of the box
      const oraclePubkeyHex = getDemoOracleKeypair().publicKeyHex;
      const cohortId = "rust-ownership-101";
      const stake = 500_000_000n; // 0.5 SOL
      const milestoneCount = 3;
      const interval = 7 * 86_400; // 7 days per milestone
      const deadlines = [
        this.initialNow + interval,
        this.initialNow + interval * 2,
        this.initialNow + interval * 3,
      ];
      const gracePeriodSeconds = 86_400; // 24h grace

      const makeParticipant = (user: string): ParticipantState => ({
        user,
        joinedAt: this.initialNow,
        stake,
        completedBitmap: 0,
        milestones: Array.from({ length: milestoneCount }, (_, idx) => ({
          milestoneIdx: idx,
          answerHash: "",
          commitTimestamp: 0,
          attemptCount: 0,
          completed: false,
        })),
        settled: false,
        claimed: false,
      });

      fresh.personas.alice.lamportsBalance -= stake;
      fresh.personas.bob.lamportsBalance -= stake;
      fresh.personas.carol.lamportsBalance -= stake;

      fresh.cohorts[cohortId] = {
        id: cohortId,
        title: "Rust Ownership & Borrowing Bootcamp",
        description:
          "Master stack vs. heap, move semantics, borrowing rules, and lifetimes across 3 graded milestones.",
        creator: "creator",
        epoch: this.initialNow,
        status: "Active",
        stake,
        milestoneCount,
        maxParticipants: 10,
        deadlines,
        gracePeriodSeconds,
        contentHash: DEFAULT_CONTENT_HASH,
        oraclePubkeyHex,
        clusterId: DEFAULT_CLUSTER_ID,
        programId: DEFAULT_PROGRAM_ID,
        startedAt: this.initialNow,
        lastOracleTs: 0,
        participants: {
          alice: makeParticipant("alice"),
          bob: makeParticipant("bob"),
          carol: makeParticipant("carol"),
        },
        vaultBalance: stake * 3n,
        totalDeposits: stake * 3n,
        totalBountiesPaid: 0n,
      };
    }

    return fresh;
  }

  private saveState(): void {
    if (this.persistEnabled && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          serializeWithBigInt(this.state)
        );
      } catch {
        // Ignore quota errors in throwaway prototype
      }
    }
  }

  private nextSignature(): string {
    const idx = this.state.txCounter++;
    const hash = hashAnswerText(`tx_${this.state.now}_${idx}`).slice(0, 44);
    return `5PgP${idx.toString().padStart(4, "0")}${hash}`;
  }

  private logTx(
    entry: Omit<SimulatedTransactionLog, "signature" | "timestamp">
  ): SimulatedTransactionLog {
    const tx: SimulatedTransactionLog = {
      ...entry,
      signature: this.nextSignature(),
      timestamp: this.state.now,
    };
    this.state.transactions.unshift(tx);
    return tx;
  }

  private fail(
    instruction: SimulatedTransactionLog["instruction"],
    caller: string,
    code: ChainErrorCode,
    message: string,
    cohortId?: string
  ): never {
    const tx = this.logTx({
      instruction,
      caller,
      cohortId,
      status: "ERROR",
      errorCode: code,
      summary: `${instruction} rejected (${code}): ${message}`,
      details: { errorCode: code, message },
    });
    this.notify();
    throw new ChainProgramError(code, message, tx.signature);
  }

  /**
   * Automatically advances cohort status from Active -> Settling once
   * now > last deadline + grace.
   */
  private syncCohortLifecycle(cohort: CohortAccount): void {
    if (cohort.status === "Active") {
      const lastDeadline = cohort.deadlines[cohort.milestoneCount - 1];
      if (this.state.now > lastDeadline + cohort.gracePeriodSeconds) {
        cohort.status = "Settling";
      }
    }
  }

  public getNow(): number {
    return this.state.now;
  }

  public getPersonas(): PersonaAccount[] {
    return Object.values(this.state.personas);
  }

  public getPersona(user: string): PersonaAccount | undefined {
    return this.state.personas[user];
  }

  public getCohorts(): CohortAccount[] {
    const list = Object.values(this.state.cohorts);
    for (const c of list) {
      this.syncCohortLifecycle(c);
    }
    return list.sort((a, b) => b.epoch - a.epoch);
  }

  public getCohort(cohortId: string): CohortAccount | undefined {
    const cohort = this.state.cohorts[cohortId];
    if (cohort) {
      this.syncCohortLifecycle(cohort);
    }
    return cohort;
  }

  public getTransactions(cohortId?: string): SimulatedTransactionLog[] {
    if (!cohortId) return this.state.transactions;
    return this.state.transactions.filter((tx) => tx.cohortId === cohortId);
  }

  /**
   * Per-user, per-milestone outcome (ADR 0011):
   * After deadline[i] + grace:
   * - passed = PASSED
   * - no on-time commit = MISSED
   * - committed but failed grade (< 75) or oracle active at/after commitTimestamp = MISSED
   * - committed on time and zero cohort oracle activity after commitTimestamp (lastOracleTs < commitTimestamp) = NEUTRAL
   */
  public getMilestoneOutcome(
    cohort: CohortAccount,
    user: string,
    milestoneIdx: number,
    now: number = this.state.now
  ): MilestoneOutcome {
    const participant = cohort.participants[user];
    if (!participant) return "PENDING";
    const record = participant.milestones[milestoneIdx];
    if (!record) return "PENDING";

    const bitSet = (participant.completedBitmap & (1 << milestoneIdx)) !== 0;
    if (record.completed || bitSet) {
      return "PASSED";
    }

    const deadline = cohort.deadlines[milestoneIdx];
    const windowClose = deadline + cohort.gracePeriodSeconds;

    if (now <= windowClose) {
      return record.attemptCount > 0 ? "COMMITTED" : "PENDING";
    }

    // Window has closed (now > deadline[i] + grace)
    if (
      record.attemptCount === 0 ||
      !record.answerHash ||
      record.commitTimestamp <= 0 ||
      record.commitTimestamp > deadline
    ) {
      return "MISSED";
    }

    if (record.failedGradeScore !== undefined && record.failedGradeScore < 75) {
      return "MISSED";
    }

    const lastOracleTs = cohort.lastOracleTs ?? 0;
    if (lastOracleTs < record.commitTimestamp) {
      return "NEUTRAL";
    }

    return "MISSED";
  }

  private tallyParticipantOutcomes(
    cohort: CohortAccount,
    user: string
  ): { missedCount: number; passedCount: number; eligibleForReward: boolean } {
    let missedCount = 0;
    let passedCount = 0;
    for (let i = 0; i < cohort.milestoneCount; i++) {
      const outcome = this.getMilestoneOutcome(cohort, user, i, this.state.now);
      if (outcome === "MISSED") missedCount++;
      if (outcome === "PASSED") passedCount++;
    }
    return {
      missedCount,
      passedCount,
      eligibleForReward:
        passedCount === cohort.milestoneCount && missedCount === 0,
    };
  }

  private computeCohortYieldAndLoss(cohort: CohortAccount): {
    simulatedYield: bigint;
    lenderLoss: bigint;
  } {
    const elapsedSeconds = BigInt(
      Math.max(0, this.state.now - (cohort.startedAt ?? cohort.epoch))
    );
    const simulatedYield = computeSimulatedYield(
      cohort.totalDeposits,
      this.state.yieldAprBps,
      elapsedSeconds
    );
    const lenderLoss = computeLenderLoss(
      cohort.totalDeposits,
      this.state.lenderLossBps
    );
    return { simulatedYield, lenderLoss };
  }

  /**
   * Computes live or finalized economics for a cohort.
   */
  public computeLiveEconomics(cohortId: string): EconomicsResult {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      throw new ChainProgramError(
        "WrongCohort",
        `Cohort "${cohortId}" not found.`
      );
    }
    if (cohort.status === "Finalized" && cohort.economicsSnapshot) {
      return cohort.economicsSnapshot;
    }

    const participantsList = Object.values(cohort.participants).map((p) => {
      const { missedCount, eligibleForReward } = this.tallyParticipantOutcomes(
        cohort,
        p.user
      );
      return {
        user: p.user,
        stake: p.stake,
        missedCount:
          p.settled && p.missedCount !== undefined
            ? p.missedCount
            : missedCount,
        eligible:
          p.settled && p.eligibleForReward !== undefined
            ? p.eligibleForReward
            : eligibleForReward,
        bountyPaid: p.settled ? p.bountyPaid : undefined,
      };
    });

    const { simulatedYield, lenderLoss } =
      this.computeCohortYieldAndLoss(cohort);

    return computeCohortEconomics({
      milestoneCount: cohort.milestoneCount,
      participants: participantsList,
      simulatedYield,
      lenderLoss,
    });
  }

  private ensurePersona(user: string): PersonaAccount {
    if (!this.state.personas[user]) {
      this.state.personas[user] = {
        id: user as PersonaAccount["id"],
        name: user,
        role: "Participant",
        pubkey: `${user}_pubkey`,
        lamportsBalance: 10n * LAMPORTS_PER_SOL,
      };
    }
    return this.state.personas[user];
  }

  public async createCohort(
    creator: string,
    intent: ValidatedCohortIntent
  ): Promise<TxResult<CohortAccount>> {
    this.ensurePersona(creator);

    const milestoneCount = intent.milestoneCount;
    if (milestoneCount < 2 || milestoneCount > 10) {
      this.fail(
        "create_cohort",
        creator,
        "CohortNotOpen",
        "milestoneCount must be 2..10"
      );
    }
    if (intent.maxParticipants < 2 || intent.maxParticipants > 50) {
      this.fail(
        "create_cohort",
        creator,
        "CohortNotOpen",
        "maxParticipants must be 2..50"
      );
    }

    const stake =
      intent.stakeLamports !== undefined
        ? intent.stakeLamports
        : parseSolToLamports(intent.stakeSol);

    const slugBase =
      intent.id ??
      intent.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 28);
    const id = this.state.cohorts[slugBase]
      ? `${slugBase}-${this.state.txCounter}`
      : slugBase || `cohort-${this.state.txCounter}`;

    const epoch = this.state.now;
    const totalSeconds = intent.demoFastMode
      ? milestoneCount * 120 // 2 minutes per milestone in Demo Fast Mode
      : intent.durationDays * 86_400;
    const intervalSeconds = Math.max(
      60,
      Math.floor(totalSeconds / milestoneCount)
    );
    const gracePeriodSeconds =
      intent.gracePeriodSeconds ?? (intent.demoFastMode ? 60 : 86_400);

    const deadlines = Array.from(
      { length: milestoneCount },
      (_, idx) => epoch + intervalSeconds * (idx + 1)
    );

    const oraclePubkeyHex = getDemoOracleKeypair().publicKeyHex;
    const trimmedCustomMaterial = intent.customMaterialText?.trim();
    const resolvedContentHash =
      intent.contentHash ??
      (trimmedCustomMaterial
        ? hashAnswerText(trimmedCustomMaterial)
        : DEFAULT_CONTENT_HASH);

    const cohort: CohortAccount = {
      id,
      title: intent.title,
      description:
        intent.description ??
        `${milestoneCount}-milestone study cohort with ${formatSol(stake)} stake.`,
      creator,
      epoch,
      status: "Open",
      stake,
      milestoneCount,
      maxParticipants: intent.maxParticipants,
      deadlines,
      gracePeriodSeconds,
      contentHash: resolvedContentHash,
      customMaterialText: trimmedCustomMaterial || undefined,
      oraclePubkeyHex,
      clusterId: DEFAULT_CLUSTER_ID,
      programId: DEFAULT_PROGRAM_ID,
      lastOracleTs: 0,
      participants: {},
      vaultBalance: 0n,
      totalDeposits: 0n,
      totalBountiesPaid: 0n,
    };

    this.state.cohorts[id] = cohort;

    const tx = this.logTx({
      instruction: "create_cohort",
      caller: creator,
      cohortId: id,
      status: "SUCCESS",
      summary: `Created cohort "${cohort.title}" (${milestoneCount} milestones, stake ${formatSol(stake)})`,
      details: {
        cohortId: id,
        stake: formatSol(stake),
        stakeLamports: stake.toString(),
        milestoneCount,
        maxParticipants: intent.maxParticipants,
        gracePeriodSeconds,
        contentHash: resolvedContentHash,
      },
    });

    this.notify();
    return { tx, data: cohort };
  }

  public async join(
    user: string,
    cohortId: string
  ): Promise<TxResult<CohortAccount>> {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      this.fail(
        "join",
        user,
        "WrongCohort",
        `Cohort "${cohortId}" does not exist.`,
        cohortId
      );
    }

    if (cohort.status !== "Open") {
      this.fail(
        "join",
        user,
        "CohortNotOpen",
        `Cohort "${cohortId}" is ${cohort.status}; joins are only allowed while Open.`,
        cohortId
      );
    }

    const currentCount = Object.keys(cohort.participants).length;
    if (currentCount >= cohort.maxParticipants) {
      this.fail(
        "join",
        user,
        "CohortFull",
        `Cohort "${cohortId}" has reached maxParticipants (${cohort.maxParticipants}).`,
        cohortId
      );
    }

    if (cohort.participants[user]) {
      this.fail(
        "join",
        user,
        "AlreadyJoined",
        `User "${user}" already joined cohort.`,
        cohortId
      );
    }

    const persona = this.ensurePersona(user);
    if (persona.lamportsBalance < cohort.stake) {
      this.fail(
        "join",
        user,
        "InsufficientBalance",
        `User "${user}" has ${formatSol(persona.lamportsBalance)}, needs ${formatSol(cohort.stake)}.`,
        cohortId
      );
    }

    persona.lamportsBalance -= cohort.stake;
    cohort.vaultBalance += cohort.stake;
    cohort.totalDeposits += cohort.stake;

    cohort.participants[user] = {
      user,
      joinedAt: this.state.now,
      stake: cohort.stake,
      completedBitmap: 0,
      milestones: Array.from({ length: cohort.milestoneCount }, (_, idx) => ({
        milestoneIdx: idx,
        answerHash: "",
        commitTimestamp: 0,
        attemptCount: 0,
        completed: false,
      })),
      settled: false,
      claimed: false,
    };

    const tx = this.logTx({
      instruction: "join",
      caller: user,
      cohortId,
      status: "SUCCESS",
      summary: `${user} joined "${cohort.title}" and staked ${formatSol(cohort.stake)}`,
      details: {
        user,
        stake: formatSol(cohort.stake),
        vaultBalance: formatSol(cohort.vaultBalance),
        participantCount: Object.keys(cohort.participants).length,
      },
    });

    this.notify();
    return { tx, data: cohort };
  }

  public async startCohort(
    caller: string,
    cohortId: string
  ): Promise<TxResult<CohortAccount>> {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      this.fail(
        "start_cohort",
        caller,
        "WrongCohort",
        `Cohort "${cohortId}" not found.`,
        cohortId
      );
    }
    if (cohort.status !== "Open") {
      this.fail(
        "start_cohort",
        caller,
        "CohortNotOpen",
        `Cohort is already ${cohort.status}.`,
        cohortId
      );
    }
    const participantCount = Object.keys(cohort.participants).length;
    if (participantCount < 2) {
      this.fail(
        "start_cohort",
        caller,
        "MinParticipantsNotMet",
        `At least 2 participants required to start cohort (currently ${participantCount}).`,
        cohortId
      );
    }
    if (caller !== cohort.creator && !cohort.participants[caller]) {
      this.fail(
        "start_cohort",
        caller,
        "WrongUser",
        `Caller "${caller}" must be the cohort creator or a joined participant to start cohort "${cohortId}".`,
        cohortId
      );
    }

    // Re-anchor deadlines from start timestamp so intervals are fresh when started
    const firstInterval = cohort.deadlines[0] - cohort.epoch;
    cohort.startedAt = this.state.now;
    cohort.deadlines = Array.from(
      { length: cohort.milestoneCount },
      (_, idx) => this.state.now + firstInterval * (idx + 1)
    );
    cohort.status = "Active";

    const tx = this.logTx({
      instruction: "start_cohort",
      caller,
      cohortId,
      status: "SUCCESS",
      summary: `Started cohort "${cohort.title}" with ${participantCount} participants`,
      details: {
        startedAt: cohort.startedAt,
        firstDeadline: cohort.deadlines[0],
        lastDeadline: cohort.deadlines[cohort.milestoneCount - 1],
      },
    });

    this.notify();
    return { tx, data: cohort };
  }

  public async commitSubmission(
    user: string,
    cohortId: string,
    milestoneIdx: number,
    answerHash: string,
    answerText?: string
  ): Promise<TxResult<MilestoneCommitRecord>> {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      this.fail(
        "commit_submission",
        user,
        "WrongCohort",
        `Cohort "${cohortId}" not found.`,
        cohortId
      );
    }

    // If cohort is still Open and has >= 2 participants, allow auto-activation or require Active
    if (cohort.status === "Open") {
      if (Object.keys(cohort.participants).length >= 2) {
        await this.startCohort(cohort.creator, cohortId);
      } else {
        this.fail(
          "commit_submission",
          user,
          "CohortNotOpen",
          "Cohort has not started yet (needs at least 2 participants).",
          cohortId
        );
      }
    }

    const participant = cohort.participants[user];
    if (!participant) {
      this.fail(
        "commit_submission",
        user,
        "WrongUser",
        `User "${user}" is not a participant in cohort "${cohortId}".`,
        cohortId
      );
    }

    const record = participant.milestones[milestoneIdx];
    if (!record) {
      this.fail(
        "commit_submission",
        user,
        "SubmissionWindowClosed",
        `Invalid milestone index ${milestoneIdx}.`,
        cohortId
      );
    }

    if (
      record.completed ||
      (participant.completedBitmap & (1 << milestoneIdx)) !== 0
    ) {
      this.fail(
        "commit_submission",
        user,
        "AlreadyCompleted",
        `Milestone ${milestoneIdx + 1} is already completed for ${user}.`,
        cohortId
      );
    }

    const deadline = cohort.deadlines[milestoneIdx];
    if (this.state.now > deadline) {
      this.fail(
        "commit_submission",
        user,
        "SubmissionWindowClosed",
        `Commit window for milestone ${milestoneIdx + 1} closed at ${deadline} (now=${this.state.now}).`,
        cohortId
      );
    }

    if (record.attemptCount >= MAX_COMMIT_ATTEMPTS) {
      this.fail(
        "commit_submission",
        user,
        "MaxAttemptsExceeded",
        `Maximum of ${MAX_COMMIT_ATTEMPTS} commit attempts reached for milestone ${milestoneIdx + 1}.`,
        cohortId
      );
    }

    record.answerHash = answerHash;
    record.answerText = answerText;
    record.commitTimestamp = this.state.now;
    record.attemptCount += 1;
    record.failedGradeScore = undefined;

    const tx = this.logTx({
      instruction: "commit_submission",
      caller: user,
      cohortId,
      status: "SUCCESS",
      summary: `${user} committed answer hash for M${milestoneIdx + 1} (attempt ${record.attemptCount}/${MAX_COMMIT_ATTEMPTS})`,
      details: {
        milestoneIdx,
        answerHash: `${answerHash.slice(0, 16)}...`,
        commitTimestamp: record.commitTimestamp,
        attempt: record.attemptCount,
      },
    });

    this.notify();
    return { tx, data: { ...record } };
  }

  public async completeMilestone(
    caller: string,
    cohortId: string,
    milestoneIdx: number,
    attestation: OracleAttestation
  ): Promise<TxResult<MilestoneCommitRecord>> {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      this.fail(
        "complete_milestone",
        caller,
        "WrongCohort",
        `Cohort "${cohortId}" not found.`,
        cohortId
      );
    }

    if (
      attestation.cohortId !== cohort.id ||
      attestation.cohortEpoch !== cohort.epoch
    ) {
      this.fail(
        "complete_milestone",
        caller,
        "WrongCohort",
        `Attestation cohort (${attestation.cohortId}) does not match target cohort (${cohort.id}).`,
        cohortId
      );
    }

    if (attestation.user !== caller) {
      this.fail(
        "complete_milestone",
        caller,
        "WrongUser",
        `Attestation is for user "${attestation.user}", cannot be submitted for "${caller}".`,
        cohortId
      );
    }

    const participant = cohort.participants[caller];
    if (!participant) {
      this.fail(
        "complete_milestone",
        caller,
        "WrongUser",
        `User "${caller}" is not a participant in cohort "${cohortId}".`,
        cohortId
      );
    }

    const record = participant.milestones[milestoneIdx];
    if (!record) {
      this.fail(
        "complete_milestone",
        caller,
        "SubmissionWindowClosed",
        `Invalid milestone index ${milestoneIdx}.`,
        cohortId
      );
    }

    // Check bitmap / completion status first so replay attempts return AlreadyCompleted
    if (
      record.completed ||
      (participant.completedBitmap & (1 << milestoneIdx)) !== 0
    ) {
      this.fail(
        "complete_milestone",
        caller,
        "AlreadyCompleted",
        `Milestone ${milestoneIdx + 1} is already completed (bitmap=${participant.completedBitmap.toString(2)}).`,
        cohortId
      );
    }

    if (record.attemptCount === 0 || !record.answerHash) {
      this.fail(
        "complete_milestone",
        caller,
        "NotCommitted",
        `No committed submission found for ${caller} on milestone ${milestoneIdx + 1}.`,
        cohortId
      );
    }

    const deadline = cohort.deadlines[milestoneIdx];
    const graceEnd = deadline + cohort.gracePeriodSeconds;
    if (record.commitTimestamp > deadline || this.state.now > graceEnd) {
      this.fail(
        "complete_milestone",
        caller,
        "SubmissionWindowClosed",
        `Completion window closed at ${graceEnd} (now=${this.state.now}).`,
        cohortId
      );
    }

    try {
      verifyAttestation(attestation, {
        expectedProgramId: cohort.programId,
        expectedClusterId: cohort.clusterId,
        expectedCohortId: cohort.id,
        expectedCohortEpoch: cohort.epoch,
        expectedUser: caller,
        expectedMilestoneIdx: milestoneIdx,
        expectedCommitHash: record.answerHash,
        oraclePubkeyHex: cohort.oraclePubkeyHex,
        now: this.state.now,
      });
    } catch (err) {
      if (err instanceof ChainProgramError) {
        this.fail(
          "complete_milestone",
          caller,
          err.code,
          err.message,
          cohortId
        );
      }
      throw err;
    }

    record.completed = true;
    record.score = attestation.score;
    record.completedTimestamp = this.state.now;
    record.attestationSignatureHex = attestation.signatureHex;
    participant.completedBitmap |= 1 << milestoneIdx;
    cohort.lastOracleTs = this.state.now;

    const tx = this.logTx({
      instruction: "complete_milestone",
      caller,
      cohortId,
      status: "SUCCESS",
      summary: `${caller} completed M${milestoneIdx + 1} with verified oracle attestation (score ${attestation.score}/100)`,
      details: {
        milestoneIdx,
        score: attestation.score,
        lastOracleTs: cohort.lastOracleTs,
        completedBitmap: `0b${participant.completedBitmap.toString(2).padStart(cohort.milestoneCount, "0")}`,
      },
    });

    this.notify();
    return { tx, data: { ...record } };
  }

  public async settleUser(
    caller: string,
    cohortId: string,
    targetUser: string
  ): Promise<
    TxResult<{ missedCount: number; forfeit: bigint; bounty: bigint }>
  > {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      this.fail(
        "settle_user",
        caller,
        "WrongCohort",
        `Cohort "${cohortId}" not found.`,
        cohortId
      );
    }

    const lastDeadline = cohort.deadlines[cohort.milestoneCount - 1];
    const settleWindowStart = lastDeadline + cohort.gracePeriodSeconds;
    if (this.state.now <= settleWindowStart) {
      this.fail(
        "settle_user",
        caller,
        "SettlementTooEarly",
        `Cannot settle before last milestone grace window closes at ${settleWindowStart} (now=${this.state.now}).`,
        cohortId
      );
    }

    const participant = cohort.participants[targetUser];
    if (!participant) {
      this.fail(
        "settle_user",
        caller,
        "WrongUser",
        `User "${targetUser}" is not in cohort "${cohortId}".`,
        cohortId
      );
    }

    if (participant.settled) {
      this.fail(
        "settle_user",
        caller,
        "AlreadySettled",
        `User "${targetUser}" has already been settled.`,
        cohortId
      );
    }

    const { missedCount, eligibleForReward } = this.tallyParticipantOutcomes(
      cohort,
      targetUser
    );
    const forfeit = computeForfeit(
      participant.stake,
      missedCount,
      cohort.milestoneCount
    );
    const bounty = computeSettleBounty(forfeit);
    const netForfeit = forfeit - bounty;

    participant.settled = true;
    participant.settledBy = caller;
    participant.settledAt = this.state.now;
    participant.missedCount = missedCount;
    participant.forfeit = forfeit;
    participant.bountyPaid = bounty;
    participant.netForfeit = netForfeit;
    participant.eligibleForReward = eligibleForReward;

    // Pay bounty out of the forfeit at settle time to the caller
    const callerPersona = this.ensurePersona(caller);
    callerPersona.lamportsBalance += bounty;
    cohort.vaultBalance -= bounty;
    cohort.totalBountiesPaid += bounty;

    const tx = this.logTx({
      instruction: "settle_user",
      caller,
      cohortId,
      status: "SUCCESS",
      summary: `${caller} settled ${targetUser}: ${missedCount}/${cohort.milestoneCount} missed, forfeit ${formatSol(forfeit)}, caller bounty ${formatSol(bounty)}`,
      details: {
        targetUser,
        settledBy: caller,
        missedCount,
        eligibleForReward,
        forfeit: formatSol(forfeit),
        bounty: formatSol(bounty),
      },
    });

    this.notify();
    return { tx, data: { missedCount, forfeit, bounty } };
  }

  public async finalize(
    caller: string,
    cohortId: string
  ): Promise<TxResult<EconomicsResult>> {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      this.fail(
        "finalize",
        caller,
        "WrongCohort",
        `Cohort "${cohortId}" not found.`,
        cohortId
      );
    }

    const lastDeadline = cohort.deadlines[cohort.milestoneCount - 1];
    if (this.state.now <= lastDeadline + cohort.gracePeriodSeconds) {
      this.fail(
        "finalize",
        caller,
        "SettlementTooEarly",
        "Cannot finalize before the final milestone window closes.",
        cohortId
      );
    }

    if (cohort.status === "Finalized") {
      this.fail(
        "finalize",
        caller,
        "AlreadyFinalized",
        "Cohort is already finalized.",
        cohortId
      );
    }

    const participants = Object.values(cohort.participants);
    const unsettled = participants.find((p) => !p.settled);
    if (unsettled) {
      this.fail(
        "finalize",
        caller,
        "NotAllUsersSettled",
        `Cannot finalize until all participants are settled ("${unsettled.user}" is unsettled).`,
        cohortId
      );
    }

    const { simulatedYield, lenderLoss } =
      this.computeCohortYieldAndLoss(cohort);

    const econ = computeCohortEconomics({
      milestoneCount: cohort.milestoneCount,
      simulatedYield,
      lenderLoss,
      participants: participants.map((p) => ({
        user: p.user,
        stake: p.stake,
        missedCount: p.missedCount ?? 0,
        eligible: p.eligibleForReward ?? false,
        bountyPaid: p.bountyPaid ?? 0n,
      })),
    });

    cohort.vaultBalance = econ.assets;
    cohort.economicsSnapshot = econ;
    cohort.status = "Finalized";
    cohort.finalizedAt = this.state.now;

    for (const breakdown of econ.participants) {
      const pState = cohort.participants[breakdown.user];
      if (pState) {
        pState.payoutAmount = breakdown.payout;
      }
    }

    const tx = this.logTx({
      instruction: "finalize",
      caller,
      cohortId,
      status: "SUCCESS",
      summary: `Finalized "${cohort.title}": pool ${formatSol(econ.pool)}, fee ${formatSol(econ.fee)}, dust ${formatSol(econ.dust)}`,
      details: {
        assets: formatSol(econ.assets),
        liabilities: formatSol(econ.liabilities),
        pool: formatSol(econ.pool),
        fee: formatSol(econ.fee),
        dust: formatSol(econ.dust),
        invariantHolds: econ.invariantHolds,
      },
    });

    this.notify();
    return { tx, data: econ };
  }

  public async claim(
    user: string,
    cohortId: string
  ): Promise<TxResult<{ payout: bigint }>> {
    const cohort = this.getCohort(cohortId);
    if (!cohort) {
      this.fail(
        "claim",
        user,
        "WrongCohort",
        `Cohort "${cohortId}" not found.`,
        cohortId
      );
    }

    if (cohort.status !== "Finalized") {
      this.fail(
        "claim",
        user,
        "NotFinalized",
        `Cannot claim while cohort status is ${cohort.status} (must be Finalized).`,
        cohortId
      );
    }

    const participant = cohort.participants[user];
    if (!participant) {
      this.fail(
        "claim",
        user,
        "WrongUser",
        `User "${user}" is not a participant in cohort "${cohortId}".`,
        cohortId
      );
    }

    if (participant.claimed) {
      this.fail(
        "claim",
        user,
        "AlreadyClaimed",
        `User "${user}" has already claimed their payout for cohort "${cohortId}".`,
        cohortId
      );
    }

    const payout = participant.payoutAmount ?? 0n;
    participant.claimed = true;
    participant.claimedAt = this.state.now;

    const persona = this.ensurePersona(user);
    persona.lamportsBalance += payout;
    cohort.vaultBalance =
      cohort.vaultBalance >= payout ? cohort.vaultBalance - payout : 0n;

    const tx = this.logTx({
      instruction: "claim",
      caller: user,
      cohortId,
      status: "SUCCESS",
      summary: `${user} claimed ${formatSol(payout)} from "${cohort.title}"`,
      details: {
        user,
        payout: formatSol(payout),
        newWalletBalance: formatSol(persona.lamportsBalance),
      },
    });

    this.notify();
    return { tx, data: { payout } };
  }

  public async faucet(
    user: string,
    amountLamports: bigint = 5n * LAMPORTS_PER_SOL
  ): Promise<TxResult<{ newBalance: bigint }>> {
    const persona = this.ensurePersona(user);
    persona.lamportsBalance += amountLamports;

    const tx = this.logTx({
      instruction: "faucet",
      caller: user,
      status: "SUCCESS",
      summary: `Airdropped ${formatSol(amountLamports)} test SOL to ${persona.name}`,
      details: {
        user,
        airdropped: formatSol(amountLamports),
        newBalance: formatSol(persona.lamportsBalance),
      },
    });

    this.notify();
    return { tx, data: { newBalance: persona.lamportsBalance } };
  }

  public advanceClock(deltaSeconds: number): void {
    this.state.now += Math.floor(deltaSeconds);
    for (const c of Object.values(this.state.cohorts)) {
      this.syncCohortLifecycle(c);
    }
    this.notify();
  }

  public setClock(timestampSeconds: number): void {
    this.state.now = Math.floor(timestampSeconds);
    for (const c of Object.values(this.state.cohorts)) {
      this.syncCohortLifecycle(c);
    }
    this.notify();
  }

  public setYieldAprBps(aprBps: bigint): void {
    this.state.yieldAprBps = aprBps < 0n ? 0n : aprBps;
    this.notify();
  }

  public getYieldAprBps(): bigint {
    return this.state.yieldAprBps;
  }

  public setLenderLossBps(lossBps: bigint): void {
    const clamped =
      lossBps < 0n ? 0n : lossBps > BPS_DENOMINATOR ? BPS_DENOMINATOR : lossBps;
    this.state.lenderLossBps = clamped;
    this.notify();
  }

  public getLenderLossBps(): bigint {
    return this.state.lenderLossBps;
  }

  public recordFailedGrade(
    cohortId: string,
    user: string,
    milestoneIdx: number,
    score: number
  ): void {
    const cohort = this.state.cohorts[cohortId];
    const record = cohort?.participants[user]?.milestones[milestoneIdx];
    if (record && !record.completed) {
      record.failedGradeScore = score;
      this.notify();
    }
  }

  public resetState(): void {
    if (this.persistEnabled && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    this.state = this.buildFreshState();
    this.notify();
  }
}
