/* eslint-disable @typescript-eslint/no-unused-vars */
import { EconomicsResult, MilestoneOutcome } from '../economics';
import {
  ChainClient,
  CohortAccount,
  MilestoneCommitRecord,
  OracleAttestation,
  PersonaAccount,
  SimulatedTransactionLog,
  TxResult,
  ValidatedCohortIntent,
} from './types';

/**
 * SolanaChain Devnet Stub (Section 2 of p1.md)
 *
 * Implements the exact same `ChainClient` interface as `MockChain`.
 * Selected when `NEXT_PUBLIC_CHAIN=devnet`.
 * Contains one method per future Anchor instruction with a detailed TODO.
 */
export class SolanaChain implements ChainClient {
  public readonly mode = 'devnet' as const;

  // Named snake_case aliases matching Anchor IDL instruction names
  public readonly create_cohort = this.createCohort.bind(this);
  public readonly start_cohort = this.startCohort.bind(this);
  public readonly commit_submission = this.commitSubmission.bind(this);
  public readonly complete_milestone = this.completeMilestone.bind(this);
  public readonly settle_user = this.settleUser.bind(this);

  public getNow(): number {
    return Math.floor(Date.now() / 1000);
  }

  public getPersonas(): PersonaAccount[] {
    return [];
  }

  public getPersona(_user: string): PersonaAccount | undefined {
    return undefined;
  }

  public getCohorts(): CohortAccount[] {
    return [];
  }

  public getCohort(_cohortId: string): CohortAccount | undefined {
    return undefined;
  }

  public getTransactions(_cohortId?: string): SimulatedTransactionLog[] {
    return [];
  }

  public getMilestoneOutcome(
    _cohort: CohortAccount,
    _user: string,
    _milestoneIdx: number,
    _now?: number
  ): MilestoneOutcome {
    return 'PENDING';
  }

  public computeLiveEconomics(_cohortId: string): EconomicsResult {
    throw new Error('TODO: Fetch on-chain Cohort + Participant PDAs and run computeCohortEconomics');
  }

  public async createCohort(
    _creator: string,
    _intent: ValidatedCohortIntent
  ): Promise<TxResult<CohortAccount>> {
    // TODO(anchor:create_cohort): Derive Cohort PDA [b"cohort", creator, id] and Vault USDC Token Account PDA,
    // serialize ValidatedCohortIntent parameters, and send `program.methods.createCohort(...)`.
    throw new Error('TODO: SolanaChain.create_cohort not yet wired to deployed Anchor program');
  }

  public async startCohort(
    _caller: string,
    _cohortId: string
  ): Promise<TxResult<CohortAccount>> {
    // TODO(anchor:start_cohort): Send `program.methods.startCohort()` signed by cohort creator once >= 2 joined.
    throw new Error('TODO: SolanaChain.start_cohort not yet wired to deployed Anchor program');
  }

  public async join(_user: string, _cohortId: string): Promise<TxResult<CohortAccount>> {
    // TODO(anchor:join): Derive Participant PDA [b"participant", cohort, user], transfer `cohort.stake` USDC
    // from user's ATA to cohort Vault ATA via SPL Token program.
    throw new Error('TODO: SolanaChain.join not yet wired to deployed Anchor program');
  }

  public async commitSubmission(
    _user: string,
    _cohortId: string,
    _milestoneIdx: number,
    _answerHash: string,
    _answerText?: string
  ): Promise<TxResult<MilestoneCommitRecord>> {
    // TODO(anchor:commit_submission): Store 32-byte `answerHash` and `Clock::get()?.unix_timestamp`
    // in the Participant PDA for `milestone_idx` while `clock.unix_timestamp <= cohort.deadlines[milestone_idx]`.
    throw new Error('TODO: SolanaChain.commit_submission not yet wired to deployed Anchor program');
  }

  public async completeMilestone(
    _caller: string,
    _cohortId: string,
    _milestoneIdx: number,
    _attestation: OracleAttestation
  ): Promise<TxResult<MilestoneCommitRecord>> {
    // TODO(anchor:complete_milestone): Prepend Ed25519SigVerify111111111111111111111111111 instruction
    // (or verify oracle co-signer) over canonical PAGEPLEDGE_ATT_V1 payload and set bit `1 << milestone_idx`
    // in `participant.completed_bitmap`.
    throw new Error('TODO: SolanaChain.complete_milestone not yet wired to deployed Anchor program');
  }

  public async settleUser(
    _caller: string,
    _cohortId: string,
    _targetUser: string
  ): Promise<TxResult<{ missedCount: number; forfeit: bigint; bounty: bigint }>> {
    // TODO(anchor:settle_user): Permissionless ix after `last_deadline + grace`. Tallies missed milestones,
    // transfers `min(1% of forfeit, 1 USDC)` bounty to `caller` ATA, and records net forfeit on Cohort PDA.
    throw new Error('TODO: SolanaChain.settle_user not yet wired to deployed Anchor program');
  }

  public async finalize(_caller: string, _cohortId: string): Promise<TxResult<EconomicsResult>> {
    // TODO(anchor:finalize): Permissionless ix once `settled_count == participant_count`. Computes pool,
    // protocol fee (200 bps), haircut h, and transfers protocol fee + rounding dust to Treasury ATA.
    throw new Error('TODO: SolanaChain.finalize not yet wired to deployed Anchor program');
  }

  public async claim(_user: string, _cohortId: string): Promise<TxResult<{ payout: bigint }>> {
    // TODO(anchor:claim): Transfers `payout_i` from Cohort Vault ATA to `user` ATA and marks `claimed = true`.
    throw new Error('TODO: SolanaChain.claim not yet wired to deployed Anchor program');
  }

  public async faucet(
    _user: string,
    _amountMicroUsdc: bigint
  ): Promise<TxResult<{ newBalance: bigint }>> {
    throw new Error('TODO: Devnet USDC faucet mint instruction');
  }

  public advanceClock(_deltaSeconds: number): void {
    // No-op on live chain
  }

  public setClock(_timestampSeconds: number): void {
    // No-op on live chain
  }

  public setYieldAprBps(_aprBps: bigint): void {}
  public getYieldAprBps(): bigint {
    return 0n;
  }
  public setLenderLossBps(_lossBps: bigint): void {}
  public getLenderLossBps(): bigint {
    return 0n;
  }
  public recordFailedGrade(
    _cohortId: string,
    _user: string,
    _milestoneIdx: number,
    _score: number
  ): void {}
  public resetState(): void {}
}
