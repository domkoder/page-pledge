import { EconomicsResult, MilestoneOutcome } from "../economics";

/**
 * Exact program error codes from Section 3 of p1.md
 */
export type ChainErrorCode =
  | "WrongUser"
  | "WrongCohort"
  | "AttestationExpired"
  | "ScoreTooLow"
  | "AlreadyCompleted"
  | "SubmissionWindowClosed"
  | "NotCommitted"
  | "SettlementTooEarly"
  | "AlreadySettled"
  | "NotFinalized"
  | "AlreadyClaimed"
  | "BadSignature"
  | "CohortNotOpen"
  | "CohortFull"
  | "MinParticipantsNotMet"
  | "MaxAttemptsExceeded"
  | "AlreadyJoined"
  | "InsufficientBalance"
  | "NotAllUsersSettled"
  | "AlreadyFinalized";

export class ChainProgramError extends Error {
  public readonly code: ChainErrorCode;
  public readonly txSignature: string;

  constructor(code: ChainErrorCode, message: string, txSignature?: string) {
    super(`[ProgramError:${code}] ${message}`);
    this.name = "ChainProgramError";
    this.code = code;
    this.txSignature =
      txSignature ?? `err_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export type CohortStatus = "Open" | "Active" | "Settling" | "Finalized";

export type PersonaId =
  "alice" | "bob" | "carol" | "dave" | "keeper" | "creator";

export interface PersonaAccount {
  id: PersonaId;
  name: string;
  role: string;
  pubkey: string;
  lamportsBalance: bigint; // Native SOL in lamports (9 decimals)
}

export interface MilestoneCommitRecord {
  milestoneIdx: number;
  answerHash: string;
  answerText?: string;
  commitTimestamp: number; // simulated unix timestamp (seconds)
  attemptCount: number; // 1..3
  completed: boolean;
  score?: number;
  completedTimestamp?: number;
  attestationSignatureHex?: string;
  failedGradeScore?: number; // tracks if committed answer was graded < 75
}

export interface ParticipantState {
  user: string; // pubkey or persona id
  joinedAt: number;
  stake: bigint;
  completedBitmap: number; // bit i is 1 if milestone i is completed
  milestones: MilestoneCommitRecord[];
  settled: boolean;
  settledBy?: string;
  settledAt?: number;
  missedCount?: number;
  forfeit?: bigint;
  bountyPaid?: bigint;
  netForfeit?: bigint;
  eligibleForReward?: boolean;
  payoutAmount?: bigint;
  claimed: boolean;
  claimedAt?: number;
}

export interface CohortAccount {
  id: string; // creator-supplied nonce / slug
  title: string;
  description: string;
  creator: string;
  epoch: number; // created_at unix seconds
  status: CohortStatus;
  stake: bigint; // S_i in lamports
  milestoneCount: number; // M (2..10)
  maxParticipants: number; // 2..50
  deadlines: number[]; // unix timestamps (seconds) of length M
  gracePeriodSeconds: number;
  contentHash: string;
  customMaterialText?: string;
  oraclePubkeyHex: string; // 32-byte Ed25519 public key in hex (64 chars)
  clusterId: string;
  programId: string;
  startedAt?: number;
  lastOracleTs: number; // unix timestamp of latest completeMilestone (0 if none)
  participants: Record<string, ParticipantState>; // keyed by user pubkey
  vaultBalance: bigint; // current vault assets in lamports
  totalDeposits: bigint;
  totalBountiesPaid: bigint;
  economicsSnapshot?: EconomicsResult;
  finalizedAt?: number;
}

export interface OracleAttestation {
  cohortId: string;
  cohortEpoch: number;
  user: string;
  milestoneIdx: number;
  score: number;
  commitHash: string;
  expiresAt: number; // unix timestamp (seconds)
  signatureHex: string; // 64-byte Ed25519 signature in hex (128 chars)
  oraclePubkeyHex?: string;
}

export interface SimulatedTransactionLog {
  signature: string;
  timestamp: number;
  instruction:
    | "create_cohort"
    | "start_cohort"
    | "join"
    | "commit_submission"
    | "complete_milestone"
    | "settle_user"
    | "finalize"
    | "claim"
    | "faucet";
  caller: string;
  cohortId?: string;
  status: "SUCCESS" | "ERROR";
  errorCode?: ChainErrorCode;
  summary: string;
  details: Record<string, string | number | boolean>;
}

export interface ValidatedCohortIntent {
  id?: string;
  title: string;
  description?: string;
  durationDays: number; // 1..90
  milestoneCount: number; // 2..10
  stakeSol: number; // 0.05..10 (or exact lamports via stakeLamports)
  stakeLamports?: bigint;
  maxParticipants: number; // 2..50
  demoFastMode?: boolean; // when true: 2-minute milestone intervals, 1-minute grace
  contentHash?: string;
  customMaterialText?: string;
  gracePeriodSeconds?: number;
}

export interface TxResult<T = void> {
  tx: SimulatedTransactionLog;
  data: T;
}

/**
 * ChainClient interface (Section 2 of p1.md)
 * UI code must only talk to this interface.
 */
export interface ChainClient {
  readonly mode: "mock" | "devnet";

  // Read state
  getNow(): number;
  getPersonas(): PersonaAccount[];
  getPersona(user: string): PersonaAccount | undefined;
  getCohorts(): CohortAccount[];
  getCohort(cohortId: string): CohortAccount | undefined;
  getTransactions(cohortId?: string): SimulatedTransactionLog[];
  getMilestoneOutcome(
    cohort: CohortAccount,
    user: string,
    milestoneIdx: number,
    now?: number
  ): MilestoneOutcome;
  computeLiveEconomics(cohortId: string): EconomicsResult;

  // Protocol instructions (matching future Anchor instructions)
  createCohort(
    creator: string,
    intent: ValidatedCohortIntent
  ): Promise<TxResult<CohortAccount>>;
  startCohort(
    caller: string,
    cohortId: string
  ): Promise<TxResult<CohortAccount>>;
  join(user: string, cohortId: string): Promise<TxResult<CohortAccount>>;
  commitSubmission(
    user: string,
    cohortId: string,
    milestoneIdx: number,
    answerHash: string,
    answerText?: string
  ): Promise<TxResult<MilestoneCommitRecord>>;
  completeMilestone(
    caller: string,
    cohortId: string,
    milestoneIdx: number,
    attestation: OracleAttestation
  ): Promise<TxResult<MilestoneCommitRecord>>;
  settleUser(
    caller: string,
    cohortId: string,
    targetUser: string
  ): Promise<
    TxResult<{ missedCount: number; forfeit: bigint; bounty: bigint }>
  >;
  finalize(
    caller: string,
    cohortId: string
  ): Promise<TxResult<EconomicsResult>>;
  claim(user: string, cohortId: string): Promise<TxResult<{ payout: bigint }>>;

  // Demo & Simulation controls
  faucet(
    user: string,
    amountLamports?: bigint
  ): Promise<TxResult<{ newBalance: bigint }>>;
  advanceClock(deltaSeconds: number): void;
  setClock(timestampSeconds: number): void;
  setYieldAprBps(aprBps: bigint): void;
  getYieldAprBps(): bigint;
  setLenderLossBps(lossBps: bigint): void;
  getLenderLossBps(): bigint;
  recordFailedGrade(
    cohortId: string,
    user: string,
    milestoneIdx: number,
    score: number
  ): void;
  resetState(): void;
}
