import {
  address as toAddress,
  createSolanaRpc,
  getAddressEncoder,
  getBase58Decoder,
  getBase64Encoder,
  lamports as toLamports,
  type Address,
  type EncodedAccount,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { createClient } from "@solana/kit-client-rpc";
import {
  COHORT_DISCRIMINATOR,
  PARTICIPANT_DISCRIMINATOR,
  VAULT_PROGRAM_ADDRESS,
  decodeCohort,
  decodeParticipant,
  findCohortPda,
  findParticipantPda,
  findVaultPda,
  getClaimInstruction,
  getCommitSubmissionInstruction,
  getCompleteMilestoneInstruction,
  getCreateCohortInstruction,
  getFinalizeInstruction,
  getJoinInstruction,
  getSettleUserInstruction,
  getStartCohortInstruction,
  type Cohort,
  type Participant,
} from "@/app/generated/vault";
import {
  computeCohortEconomics,
  formatSol,
  parseSolToLamports,
  type EconomicsResult,
  type MilestoneOutcome,
} from "../economics";
import {
  buildAttestationPayload,
  bytesToHex,
  getDemoOracleKeypair,
  hashAnswerText,
  hexToBytes,
} from "./attestation";
import {
  ChainClient,
  ChainErrorCode,
  ChainProgramError,
  CohortAccount,
  CohortStatus,
  MilestoneCommitRecord,
  OracleAttestation,
  ParticipantState,
  PersonaAccount,
  SimulatedTransactionLog,
  TxResult,
  ValidatedCohortIntent,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ED25519_PROGRAM_ADDRESS =
  "Ed25519SigVerify111111111111111111111111111" as Address;
export const SYSTEM_PROGRAM_ADDRESS =
  "11111111111111111111111111111111" as Address;
/** The Rust program hard-codes "devnet" in the signed payload. */
export const DEVNET_CLUSTER_ID = "devnet";
const MAX_MILESTONES = 10;
const DEFAULT_CONTENT_HASH = "0".repeat(64);

/** Anchor error codes -> spec error names (IDL errors 6002..6021; 6000/6001 are not in the UI vocabulary). */
export const PROGRAM_ERROR_NAMES: Record<number, ChainErrorCode> = {
  6002: "WrongUser",
  6003: "WrongCohort",
  6004: "AttestationExpired",
  6005: "ScoreTooLow",
  6006: "AlreadyCompleted",
  6007: "SubmissionWindowClosed",
  6008: "NotCommitted",
  6009: "SettlementTooEarly",
  6010: "AlreadySettled",
  6011: "NotFinalized",
  6012: "AlreadyClaimed",
  6013: "BadSignature",
  6014: "CohortNotOpen",
  6015: "CohortFull",
  6016: "MinParticipantsNotMet",
  6017: "MaxAttemptsExceeded",
  6018: "AlreadyJoined",
  6019: "InsufficientBalance",
  6020: "NotAllUsersSettled",
  6021: "AlreadyFinalized",
};

const STATUS_BY_CODE: CohortStatus[] = [
  "Open",
  "Active",
  "Settling",
  "Finalized",
];

// ---------------------------------------------------------------------------
// Dependencies (injectable for tests and for the wallet bridge)
// ---------------------------------------------------------------------------

type Sendable<T> = { send: () => Promise<T> };

export interface RawProgramAccount {
  pubkey: Address;
  account: { data: readonly [string, string] | string; lamports: bigint };
}

/** The slice of the Solana RPC that SolanaChain needs. */
export interface ChainRpc {
  getProgramAccounts(
    program: Address,
    config: unknown
  ): Sendable<readonly RawProgramAccount[]>;
  getBalance(addr: Address): Sendable<bigint | { value: bigint }>;
}

export interface SolanaChainDeps {
  rpc: ChainRpc;
  /** Signs with `signer`, sends and confirms; resolves to the transaction signature. */
  send: (
    signer: TransactionSigner,
    instructions: Instruction[]
  ) => Promise<string>;
  programAddress?: Address;
  /** Treasury recorded at create_cohort. Defaults to the cohort creator. */
  treasury?: Address;
  /** Oracle pubkey recorded at create_cohort. Defaults to the demo oracle. */
  oraclePubkey?: Uint8Array;
  now?: () => number;
  /** Optional devnet airdrop used by faucet(). */
  airdrop?: (addr: Address, lamports: bigint) => Promise<void>;
}

export function createDefaultDeps(
  env: Record<string, string | undefined> = {}
): SolanaChainDeps {
  const url =
    env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    (typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_SOLANA_RPC_URL
      : undefined) ??
    "https://api.devnet.solana.com";
  const rpc = createSolanaRpc(url) as unknown as ChainRpc;
  const clients = new Map<string, ReturnType<typeof createClient>>();
  const treasuryEnv =
    env.NEXT_PUBLIC_TREASURY ??
    (typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_TREASURY
      : undefined);
  return {
    rpc,
    treasury: treasuryEnv ? toAddress(treasuryEnv) : undefined,
    send: async (signer, instructions) => {
      let client = clients.get(signer.address);
      if (!client) {
        client = createClient({ url, payer: signer });
        clients.set(signer.address, client);
      }
      const result = await client.sendTransaction(instructions);
      return String(result.context.signature);
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Pulls an Anchor custom error code out of whatever kit / the RPC threw. */
export function extractCustomErrorCode(err: unknown): number | undefined {
  let cur: unknown = err;
  const seen = new Set<unknown>();
  for (let depth = 0; cur && depth < 8 && !seen.has(cur); depth++) {
    seen.add(cur);
    const ctx = (cur as { context?: { code?: unknown } }).context;
    if (ctx && typeof ctx.code === "number" && ctx.code >= 6000)
      return ctx.code;
    const msg = String((cur as { message?: unknown }).message ?? "");
    const hex = /custom program error:?\s*0x([0-9a-f]+)/i.exec(msg);
    if (hex) return parseInt(hex[1]!, 16);
    const dec =
      /custom program error:?\s*#?(\d{4,})/i.exec(msg) ??
      /"Custom"\s*:\s*(\d{4,})/.exec(msg) ??
      /Custom\((\d{4,})\)/.exec(msg);
    if (dec) return Number(dec[1]);
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export function mapProgramError(err: unknown, txSignature?: string): unknown {
  if (err instanceof ChainProgramError) return err;
  const code = extractCustomErrorCode(err);
  const name = code === undefined ? undefined : PROGRAM_ERROR_NAMES[code];
  if (!name) return err;
  return new ChainProgramError(
    name,
    `Program rejected the transaction (code ${code}).`,
    txSignature
  );
}

/** Ed25519SigVerify instruction data, single signature, all data inline (layout the Rust program parses). */
export function buildEd25519InstructionData(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array
): Uint8Array {
  if (publicKey.length !== 32 || signature.length !== 64) {
    throw new Error(
      "Ed25519 instruction needs a 32-byte public key and a 64-byte signature"
    );
  }
  const header = 2 + 14;
  const pkOffset = header;
  const sigOffset = pkOffset + 32;
  const msgOffset = sigOffset + 64;
  const data = new Uint8Array(msgOffset + message.length);
  const view = new DataView(data.buffer);
  const THIS_IX = 0xffff;
  data[0] = 1; // one signature
  data[1] = 0; // padding
  view.setUint16(2, sigOffset, true);
  view.setUint16(4, THIS_IX, true);
  view.setUint16(6, pkOffset, true);
  view.setUint16(8, THIS_IX, true);
  view.setUint16(10, msgOffset, true);
  view.setUint16(12, message.length, true);
  view.setUint16(14, THIS_IX, true);
  data.set(publicKey, pkOffset);
  data.set(signature, sigOffset);
  data.set(message, msgOffset);
  return data;
}

export function makeCohortId(
  title: string,
  random: () => number = Math.random
): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 22) || "cohort";
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `${slug}-${suffix}`; // <= 27 bytes; PDA seeds are limited to 32
}

const isAllZero = (b: Uint8Array) => b.every((x) => x === 0);

// ---------------------------------------------------------------------------
// SolanaChain
// ---------------------------------------------------------------------------

type CohortRef = {
  cohortId: string;
  address: Address;
  creator: Address;
  vault: Address;
  treasury: Address;
};

export class SolanaChain implements ChainClient {
  public readonly mode = "devnet" as const;
  public readonly programAddress: Address;

  // snake_case aliases matching the Anchor instruction names
  public readonly create_cohort = this.createCohort.bind(this);
  public readonly start_cohort = this.startCohort.bind(this);
  public readonly commit_submission = this.commitSubmission.bind(this);
  public readonly complete_milestone = this.completeMilestone.bind(this);
  public readonly settle_user = this.settleUser.bind(this);

  private deps: SolanaChainDeps | undefined;
  private signers = new Map<string, TransactionSigner>();
  private balances = new Map<string, bigint>();
  private refs = new Map<string, CohortRef>();
  private cohorts = new Map<string, CohortAccount>();
  private logs: SimulatedTransactionLog[] = [];
  private inflightRefresh: Promise<void> | null = null;

  // Off-chain overlays: data that is not stored on-chain but the UI shows.
  private answerTexts = new Map<string, string>();
  private attestations = new Map<string, OracleAttestation>();
  private failedGrades = new Map<string, number>();
  private descriptions = new Map<string, string>();
  private materials = new Map<string, string>();

  constructor(deps?: SolanaChainDeps) {
    this.deps = deps;
    this.programAddress = deps?.programAddress ?? VAULT_PROGRAM_ADDRESS;
  }

  private get d(): SolanaChainDeps {
    if (!this.deps) this.deps = createDefaultDeps();
    return this.deps;
  }

  // ---- wallet bridge ----------------------------------------------------

  public registerSigner(signer: TransactionSigner): void {
    this.signers.set(signer.address, signer);
  }
  public unregisterSigner(addr: string): void {
    this.signers.delete(addr);
  }
  private signerFor(user: string): TransactionSigner {
    const s = this.signers.get(user);
    if (!s)
      throw new Error(
        `No wallet signer registered for ${user}. Connect that wallet first.`
      );
    return s;
  }

  // ---- reads (synchronous, served from the cache that refresh() fills) -------

  public getNow(): number {
    return (this.deps?.now ?? (() => Math.floor(Date.now() / 1000)))();
  }

  public getPersonas(): PersonaAccount[] {
    return [...this.signers.keys()].map((addr, i) => ({
      id: addr as PersonaAccount["id"],
      name: `Wallet ${i + 1} (${addr.slice(0, 4)}…${addr.slice(-4)})`,
      role: "wallet",
      pubkey: addr,
      lamportsBalance: this.balances.get(addr) ?? 0n,
    }));
  }

  public getPersona(user: string): PersonaAccount | undefined {
    return this.getPersonas().find((p) => p.pubkey === user);
  }

  public getCohorts(): CohortAccount[] {
    return [...this.cohorts.values()];
  }

  public getCohort(cohortId: string): CohortAccount | undefined {
    return this.cohorts.get(cohortId);
  }

  public getTransactions(cohortId?: string): SimulatedTransactionLog[] {
    return cohortId
      ? this.logs.filter((l) => l.cohortId === cohortId)
      : [...this.logs];
  }

  /**
   * Mirrors the program's classify_milestones. Note: failed off-chain grades are NOT known on-chain,
   * so unlike MockChain they never turn a NEUTRAL into a MISSED here.
   */
  public getMilestoneOutcome(
    cohort: CohortAccount,
    user: string,
    milestoneIdx: number,
    now: number = this.getNow()
  ): MilestoneOutcome {
    const participant = cohort.participants[user];
    const record = participant?.milestones[milestoneIdx];
    if (!participant || !record) return "PENDING";
    if (
      record.completed ||
      (participant.completedBitmap & (1 << milestoneIdx)) !== 0
    )
      return "PASSED";

    const deadline = cohort.deadlines[milestoneIdx] ?? 0;
    if (now <= deadline + cohort.gracePeriodSeconds) {
      return record.attemptCount > 0 ? "COMMITTED" : "PENDING";
    }
    const onTime =
      record.attemptCount > 0 &&
      record.commitTimestamp > 0 &&
      record.commitTimestamp <= deadline;
    if (onTime && cohort.lastOracleTs < record.commitTimestamp)
      return "NEUTRAL";
    return "MISSED";
  }

  public computeLiveEconomics(cohortId: string): EconomicsResult {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort)
      throw new ChainProgramError(
        "WrongCohort",
        `Cohort "${cohortId}" not found.`
      );
    if (cohort.status === "Finalized" && cohort.economicsSnapshot)
      return cohort.economicsSnapshot;
    return computeCohortEconomics({
      milestoneCount: cohort.milestoneCount,
      participants: Object.values(cohort.participants).map((p) =>
        this.tally(cohort, p)
      ),
    });
  }

  private tally(cohort: CohortAccount, p: ParticipantState) {
    let missed = 0;
    let passed = 0;
    for (let i = 0; i < cohort.milestoneCount; i++) {
      const o = this.getMilestoneOutcome(cohort, p.user, i);
      if (o === "MISSED") missed++;
      if (o === "PASSED") passed++;
    }
    return {
      user: p.user,
      stake: p.stake,
      missedCount: p.settled ? (p.missedCount ?? missed) : missed,
      eligible: p.settled
        ? (p.eligibleForReward ?? false)
        : passed === cohort.milestoneCount && missed === 0,
      bountyPaid: p.settled ? p.bountyPaid : undefined,
    };
  }

  // ---- refresh: RPC -> cache -------------------------------------------------

  /** Re-reads every Cohort and Participant account from the cluster. Safe to call often. */
  public refresh(): Promise<void> {
    if (!this.inflightRefresh) {
      this.inflightRefresh = this.doRefresh().finally(() => {
        this.inflightRefresh = null;
      });
    }
    return this.inflightRefresh;
  }

  private async fetchAccounts(
    discriminator: Uint8Array
  ): Promise<EncodedAccount[]> {
    const raw = await this.d.rpc
      .getProgramAccounts(this.programAddress, {
        encoding: "base64",
        filters: [
          {
            memcmp: {
              offset: 0n,
              bytes: getBase58Decoder().decode(discriminator),
              encoding: "base58",
            },
          },
        ],
      })
      .send();
    const b64 = getBase64Encoder();
    return raw.map((r) => {
      const text = Array.isArray(r.account.data)
        ? r.account.data[0]
        : (r.account.data as string);
      const data = new Uint8Array(b64.encode(text));
      return {
        address: r.pubkey,
        data,
        executable: false,
        lamports: toLamports(r.account.lamports),
        programAddress: this.programAddress,
        space: BigInt(data.length),
      } as EncodedAccount;
    });
  }

  private async balanceOf(addr: Address): Promise<bigint> {
    const res = await this.d.rpc.getBalance(addr).send();
    return typeof res === "bigint" ? res : res.value;
  }

  private async doRefresh(): Promise<void> {
    const [cohortAccts, participantAccts] = await Promise.all([
      this.fetchAccounts(COHORT_DISCRIMINATOR),
      this.fetchAccounts(PARTICIPANT_DISCRIMINATOR),
    ]);

    const participantsByCohort = new Map<string, Participant[]>();
    for (const enc of participantAccts) {
      const p = decodeParticipant(enc).data;
      const list = participantsByCohort.get(p.cohort) ?? [];
      list.push(p);
      participantsByCohort.set(p.cohort, list);
    }

    const decoded = cohortAccts.map((enc) => ({
      address: enc.address,
      data: decodeCohort(enc).data,
    }));
    const vaults = await Promise.all(
      decoded.map(async ({ address }) => {
        const [vault] = await findVaultPda({ cohort: address });
        return { vault, lamports: await this.balanceOf(vault) };
      })
    );

    const nextCohorts = new Map<string, CohortAccount>();
    const nextRefs = new Map<string, CohortRef>();
    decoded.forEach(({ address, data }, i) => {
      const v = vaults[i]!;
      nextRefs.set(data.id, {
        cohortId: data.id,
        address,
        creator: data.creator,
        vault: v.vault,
        treasury: data.treasury,
      });
      nextCohorts.set(
        data.id,
        this.toCohortAccount(
          address,
          data,
          participantsByCohort.get(address) ?? [],
          v.lamports
        )
      );
    });
    this.cohorts = nextCohorts;
    this.refs = nextRefs;

    await Promise.all(
      [...this.signers.keys()].map(async (addr) => {
        this.balances.set(addr, await this.balanceOf(addr as Address));
      })
    );
  }

  private toCohortAccount(
    address: Address,
    c: Cohort,
    participants: Participant[],
    vaultLamports: bigint
  ): CohortAccount {
    const M = c.milestoneCount;
    const deadlines = c.deadlines.slice(0, M).map(Number);
    const gracePeriodSeconds = Number(c.gracePeriodSeconds);
    let status: CohortStatus = STATUS_BY_CODE[c.status] ?? "Open";
    if (
      status === "Active" &&
      deadlines.length > 0 &&
      this.getNow() > deadlines[M - 1]! + gracePeriodSeconds
    ) {
      status = "Settling"; // window closed; first settle_user flips it on-chain
    }

    const states: Record<string, ParticipantState> = {};
    for (const p of participants) {
      const milestones: MilestoneCommitRecord[] = [];
      for (let i = 0; i < M; i++) {
        const hash = p.answerHashes[i] ?? new Uint8Array(32);
        const key = `${address}:${p.user}:${i}`;
        const att = this.attestations.get(key);
        milestones.push({
          milestoneIdx: i,
          answerHash: isAllZero(hash as Uint8Array)
            ? ""
            : bytesToHex(hash as Uint8Array),
          answerText: this.answerTexts.get(key),
          commitTimestamp: Number(p.commitTimestamps[i] ?? 0n),
          attemptCount: p.attemptCounts[i] ?? 0,
          completed: (p.completedBitmap & (1 << i)) !== 0,
          score: att?.score,
          attestationSignatureHex: att?.signatureHex,
          failedGradeScore: this.failedGrades.get(key),
        });
      }
      states[p.user] = {
        user: p.user,
        joinedAt: Number(p.joinedAt),
        stake: p.stake,
        completedBitmap: p.completedBitmap,
        milestones,
        settled: p.settled,
        missedCount: p.settled ? p.missedCount : undefined,
        forfeit: p.settled ? p.forfeit : undefined,
        bountyPaid: p.settled ? p.bountyPaid : undefined,
        netForfeit: p.settled ? p.netForfeit : undefined,
        eligibleForReward: p.settled ? p.eligible : undefined,
        payoutAmount: p.claimed ? p.payout : undefined,
        claimed: p.claimed,
      };
    }

    const reserve = c.vaultRentReserve;
    const account: CohortAccount = {
      id: c.id,
      title: c.title,
      description:
        this.descriptions.get(c.id) ??
        `${M}-milestone study cohort with ${formatSol(c.stake)} SOL stake.`,
      creator: c.creator,
      epoch: Number(c.epoch),
      status,
      stake: c.stake,
      milestoneCount: M,
      maxParticipants: c.maxParticipants,
      deadlines,
      gracePeriodSeconds,
      contentHash: bytesToHex(c.contentHash as Uint8Array),
      customMaterialText: this.materials.get(c.id),
      oraclePubkeyHex: bytesToHex(c.oraclePubkey as Uint8Array),
      clusterId: DEVNET_CLUSTER_ID,
      programId: this.programAddress,
      startedAt: c.startedAt > 0n ? Number(c.startedAt) : undefined,
      lastOracleTs: Number(c.lastOracleTs),
      participants: states,
      vaultBalance: vaultLamports > reserve ? vaultLamports - reserve : 0n,
      totalDeposits: c.totalDeposits,
      totalBountiesPaid: c.totalBountiesPaid,
    };

    if (status === "Finalized") {
      account.economicsSnapshot = computeCohortEconomics({
        milestoneCount: M,
        participants: participants.map((p) => ({
          user: p.user,
          stake: p.stake,
          missedCount: p.missedCount,
          eligible: p.eligible,
          bountyPaid: p.bountyPaid,
        })),
        vaultAssetsAtFinalize: c.finalizedAssets,
      });
    }
    return account;
  }

  // ---- transactions --------------------------------------------------------

  private log(
    instruction: SimulatedTransactionLog["instruction"],
    caller: string,
    cohortId: string | undefined,
    signature: string,
    status: "SUCCESS" | "ERROR",
    summary: string,
    errorCode?: ChainErrorCode
  ): SimulatedTransactionLog {
    const entry: SimulatedTransactionLog = {
      signature,
      timestamp: this.getNow(),
      instruction,
      caller,
      cohortId,
      status,
      errorCode,
      summary,
      details: {},
    };
    this.logs.push(entry);
    return entry;
  }

  private async resolveRef(cohortId: string): Promise<CohortRef> {
    let ref = this.refs.get(cohortId);
    if (!ref) {
      await this.refresh();
      ref = this.refs.get(cohortId);
    }
    if (!ref)
      throw new ChainProgramError(
        "WrongCohort",
        `Cohort "${cohortId}" not found on-chain.`
      );
    return ref;
  }

  /** Sends one transaction, refreshes the cache, and records a log entry (also on failure). */
  private async exec(
    name: SimulatedTransactionLog["instruction"],
    caller: string,
    cohortId: string | undefined,
    summary: string,
    build: (signer: TransactionSigner) => Promise<Instruction[]>
  ): Promise<SimulatedTransactionLog> {
    const signer = this.signerFor(caller);
    let signature: string;
    try {
      signature = await this.d.send(signer, await build(signer));
    } catch (err) {
      const mapped = mapProgramError(err);
      if (mapped instanceof ChainProgramError) {
        this.log(
          name,
          caller,
          cohortId,
          mapped.txSignature,
          "ERROR",
          mapped.message,
          mapped.code
        );
      }
      throw mapped;
    }
    const entry = this.log(
      name,
      caller,
      cohortId,
      signature,
      "SUCCESS",
      summary
    );
    await this.refresh();
    return entry;
  }

  private requireCohort(cohortId: string): CohortAccount {
    const c = this.cohorts.get(cohortId);
    if (!c)
      throw new ChainProgramError(
        "WrongCohort",
        `Cohort "${cohortId}" not found.`
      );
    return c;
  }

  public async createCohort(
    creator: string,
    intent: ValidatedCohortIntent
  ): Promise<TxResult<CohortAccount>> {
    const M = intent.milestoneCount;
    if (M < 2 || M > MAX_MILESTONES)
      throw new ChainProgramError(
        "CohortNotOpen",
        "milestoneCount must be 2..10"
      );
    if (intent.maxParticipants < 2 || intent.maxParticipants > 50) {
      throw new ChainProgramError(
        "CohortNotOpen",
        "maxParticipants must be 2..50"
      );
    }
    const stake = intent.stakeLamports ?? parseSolToLamports(intent.stakeSol);
    const id = intent.id ?? makeCohortId(intent.title);
    if (new TextEncoder().encode(id).length > 32)
      throw new Error("Cohort id must be at most 32 bytes");

    const totalSeconds = intent.demoFastMode
      ? M * 120
      : intent.durationDays * 86_400;
    const intervalSeconds = Math.max(60, Math.floor(totalSeconds / M));
    const grace =
      intent.gracePeriodSeconds ?? (intent.demoFastMode ? 60 : 86_400);
    const material = intent.customMaterialText?.trim();
    const contentHashHex =
      intent.contentHash ??
      (material ? hashAnswerText(material) : DEFAULT_CONTENT_HASH);
    const creatorAddr = toAddress(creator);
    const treasury = this.d.treasury ?? creatorAddr;
    const oracle = this.d.oraclePubkey ?? getDemoOracleKeypair().publicKey;

    const [cohortPda] = await findCohortPda({ creator: creatorAddr, id });
    const [vaultPda] = await findVaultPda({ cohort: cohortPda });

    const entry = await this.exec(
      "create_cohort",
      creator,
      id,
      `Created cohort "${intent.title}".`,
      async (signer) => [
        getCreateCohortInstruction(
          {
            creator: signer,
            cohort: cohortPda,
            vault: vaultPda,
            id,
            title: intent.title,
            stakeLamports: stake,
            milestoneCount: M,
            maxParticipants: intent.maxParticipants,
            intervalSeconds,
            gracePeriodSeconds: grace,
            contentHash: hexToBytes(contentHashHex),
            oraclePubkey: oracle,
            treasury,
          },
          { programAddress: this.programAddress }
        ),
      ]
    );

    if (intent.description) this.descriptions.set(id, intent.description);
    if (material) this.materials.set(id, material);
    await this.refresh();
    return { tx: entry, data: this.requireCohort(id) };
  }

  public async join(
    user: string,
    cohortId: string
  ): Promise<TxResult<CohortAccount>> {
    this.signerFor(user); // fail fast with a clear message if this wallet is not connected
    const ref = await this.resolveRef(cohortId);
    const cohort = this.requireCohort(cohortId);
    const balance = await this.balanceOf(toAddress(user));
    if (balance < cohort.stake) {
      throw new ChainProgramError(
        "InsufficientBalance",
        `Need ${formatSol(cohort.stake)} SOL to join.`
      );
    }
    const [participant] = await findParticipantPda({
      cohort: ref.address,
      user: toAddress(user),
    });
    const entry = await this.exec(
      "join",
      user,
      cohortId,
      `Joined "${cohort.title}".`,
      async (signer) => [
        getJoinInstruction(
          { user: signer, cohort: ref.address, vault: ref.vault, participant },
          { programAddress: this.programAddress }
        ),
      ]
    );
    return { tx: entry, data: this.requireCohort(cohortId) };
  }

  public async startCohort(
    caller: string,
    cohortId: string
  ): Promise<TxResult<CohortAccount>> {
    const ref = await this.resolveRef(cohortId);
    const [participant] = await findParticipantPda({
      cohort: ref.address,
      user: toAddress(caller),
    });
    const entry = await this.exec(
      "start_cohort",
      caller,
      cohortId,
      "Started cohort.",
      async (signer) => [
        getStartCohortInstruction(
          { caller: signer, cohort: ref.address, participant },
          { programAddress: this.programAddress }
        ),
      ]
    );
    return { tx: entry, data: this.requireCohort(cohortId) };
  }

  public async commitSubmission(
    user: string,
    cohortId: string,
    milestoneIdx: number,
    answerHash: string,
    answerText?: string
  ): Promise<TxResult<MilestoneCommitRecord>> {
    const ref = await this.resolveRef(cohortId);
    const [participant] = await findParticipantPda({
      cohort: ref.address,
      user: toAddress(user),
    });
    const entry = await this.exec(
      "commit_submission",
      user,
      cohortId,
      `Committed answer for milestone ${milestoneIdx + 1}.`,
      async (signer) => [
        getCommitSubmissionInstruction(
          {
            user: signer,
            cohort: ref.address,
            participant,
            milestoneIdx,
            answerHash: hexToBytes(answerHash),
          },
          { programAddress: this.programAddress }
        ),
      ]
    );
    if (answerText !== undefined)
      this.answerTexts.set(
        `${ref.address}:${user}:${milestoneIdx}`,
        answerText
      );
    await this.refresh();
    return { tx: entry, data: this.recordFor(cohortId, user, milestoneIdx) };
  }

  public async completeMilestone(
    caller: string,
    cohortId: string,
    milestoneIdx: number,
    attestation: OracleAttestation
  ): Promise<TxResult<MilestoneCommitRecord>> {
    const ref = await this.resolveRef(cohortId);
    const cohort = this.requireCohort(cohortId);
    const [participant] = await findParticipantPda({
      cohort: ref.address,
      user: toAddress(caller),
    });

    // The message the oracle signed; the program rebuilds the same bytes from its own state.
    const message = buildAttestationPayload({
      programId: this.programAddress,
      clusterId: cohort.clusterId,
      cohort: attestation.cohortId,
      cohortEpoch: attestation.cohortEpoch,
      user: attestation.user,
      milestoneIdx: attestation.milestoneIdx,
      score: attestation.score,
      commitHash: attestation.commitHash,
      expiresAt: attestation.expiresAt,
    });
    const signature = hexToBytes(attestation.signatureHex);
    const oracleKey = hexToBytes(
      attestation.oraclePubkeyHex ?? cohort.oraclePubkeyHex
    );

    const entry = await this.exec(
      "complete_milestone",
      caller,
      cohortId,
      `Completed milestone ${milestoneIdx + 1} (score ${attestation.score}).`,
      async (signer) => [
        // Must sit immediately before complete_milestone (the program reads index - 1).
        {
          programAddress: ED25519_PROGRAM_ADDRESS,
          accounts: [],
          data: buildEd25519InstructionData(oracleKey, signature, message),
        } as Instruction,
        getCompleteMilestoneInstruction(
          {
            user: signer,
            cohort: ref.address,
            participant,
            milestoneIdx,
            score: attestation.score,
            expiresAt: attestation.expiresAt,
            signature,
          },
          { programAddress: this.programAddress }
        ),
      ]
    );
    this.attestations.set(
      `${ref.address}:${caller}:${milestoneIdx}`,
      attestation
    );
    await this.refresh();
    return { tx: entry, data: this.recordFor(cohortId, caller, milestoneIdx) };
  }

  public async settleUser(
    caller: string,
    cohortId: string,
    targetUser: string
  ): Promise<
    TxResult<{ missedCount: number; forfeit: bigint; bounty: bigint }>
  > {
    const ref = await this.resolveRef(cohortId);
    const [participant] = await findParticipantPda({
      cohort: ref.address,
      user: toAddress(targetUser),
    });
    const entry = await this.exec(
      "settle_user",
      caller,
      cohortId,
      `Settled ${targetUser}.`,
      async (signer) => [
        getSettleUserInstruction(
          {
            caller: signer,
            cohort: ref.address,
            vault: ref.vault,
            participant,
          },
          { programAddress: this.programAddress }
        ),
      ]
    );
    const p = this.requireCohort(cohortId).participants[targetUser];
    return {
      tx: entry,
      data: {
        missedCount: p?.missedCount ?? 0,
        forfeit: p?.forfeit ?? 0n,
        bounty: p?.bountyPaid ?? 0n,
      },
    };
  }

  public async finalize(
    caller: string,
    cohortId: string
  ): Promise<TxResult<EconomicsResult>> {
    const ref = await this.resolveRef(cohortId);
    const entry = await this.exec(
      "finalize",
      caller,
      cohortId,
      "Finalized cohort.",
      async (signer) => [
        getFinalizeInstruction(
          {
            caller: signer,
            cohort: ref.address,
            vault: ref.vault,
            treasury: ref.treasury,
          },
          { programAddress: this.programAddress }
        ),
      ]
    );
    return { tx: entry, data: this.computeLiveEconomics(cohortId) };
  }

  public async claim(
    user: string,
    cohortId: string
  ): Promise<TxResult<{ payout: bigint }>> {
    const ref = await this.resolveRef(cohortId);
    const [participant] = await findParticipantPda({
      cohort: ref.address,
      user: toAddress(user),
    });
    const entry = await this.exec(
      "claim",
      user,
      cohortId,
      "Claimed payout.",
      async (signer) => [
        getClaimInstruction(
          {
            user: signer,
            cohort: ref.address,
            vault: ref.vault,
            participant,
            treasury: ref.treasury,
          },
          { programAddress: this.programAddress }
        ),
      ]
    );
    return {
      tx: entry,
      data: {
        payout:
          this.requireCohort(cohortId).participants[user]?.payoutAmount ?? 0n,
      },
    };
  }

  private recordFor(
    cohortId: string,
    user: string,
    idx: number
  ): MilestoneCommitRecord {
    const rec =
      this.requireCohort(cohortId).participants[user]?.milestones[idx];
    if (!rec)
      throw new ChainProgramError(
        "NotCommitted",
        "No record for that milestone."
      );
    return rec;
  }

  // ---- demo/simulation controls: not applicable on a live cluster ---------------

  public async faucet(
    user: string,
    amountLamports: bigint = 1_000_000_000n
  ): Promise<TxResult<{ newBalance: bigint }>> {
    if (!this.d.airdrop) {
      throw new Error(
        "No airdrop configured. Fund this wallet at https://faucet.solana.com (Devnet)."
      );
    }
    await this.d.airdrop(toAddress(user), amountLamports);
    const newBalance = await this.balanceOf(toAddress(user));
    this.balances.set(user, newBalance);
    const entry = this.log(
      "faucet",
      user,
      undefined,
      `airdrop_${Date.now()}`,
      "SUCCESS",
      `Airdropped ${formatSol(amountLamports)} SOL.`
    );
    return { tx: entry, data: { newBalance } };
  }

  public advanceClock(_deltaSeconds: number): void {
    void _deltaSeconds; // chain time cannot be moved
  }
  public setClock(_timestampSeconds: number): void {
    void _timestampSeconds;
  }
  public setYieldAprBps(_aprBps: bigint): void {
    void _aprBps;
  }
  public getYieldAprBps(): bigint {
    return 0n;
  }
  public setLenderLossBps(_lossBps: bigint): void {
    void _lossBps;
  }
  public getLenderLossBps(): bigint {
    return 0n;
  }
  /** Off-chain only: remembered for the UI, never sent on-chain (the program cannot see grades). */
  public recordFailedGrade(
    cohortId: string,
    user: string,
    milestoneIdx: number,
    score: number
  ): void {
    const ref = this.refs.get(cohortId);
    if (ref)
      this.failedGrades.set(`${ref.address}:${user}:${milestoneIdx}`, score);
  }
  public resetState(): void {
    this.logs = [];
    this.answerTexts.clear();
    this.attestations.clear();
    this.failedGrades.clear();
  }
}

// Re-exported for callers that need raw address helpers.
export const encodeAddress = (a: string) =>
  new Uint8Array(getAddressEncoder().encode(toAddress(a)));
