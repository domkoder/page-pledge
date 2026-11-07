import { describe, expect, it } from 'vitest';
import { ONE_USDC } from '../economics';
import {
  ChainErrorCode,
  ChainProgramError,
  MockChain,
  getDemoOracleKeypair,
  hashAnswerText,
  runScenarioPresetOnChain,
  runSecurityDemoOnChain,
  signAttestation,
} from '../chain';

async function expectChainError(
  promise: Promise<unknown>,
  expectedCode: ChainErrorCode
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ChainProgramError(${expectedCode}), but call succeeded`);
  } catch (err) {
    expect(err).toBeInstanceOf(ChainProgramError);
    expect((err as ChainProgramError).code).toBe(expectedCode);
  }
}

describe('MockChain Protocol Rules & Attestation Verification (Section 3)', () => {
  it('enforces full cohort lifecycle: Open -> Active -> Settling -> Finalized, with PASSED, MISSED, and NEUTRAL outcomes', async () => {
    const chain = new MockChain({ initialNow: 1_000_000, persist: false });

    // 1. Creator creates a 2-milestone cohort, 100 USDC stake
    const { data: cohort } = await chain.createCohort('creator', {
      id: 'cohort-alpha',
      title: 'Rust Lifetimes Deep Dive',
      durationDays: 2,
      milestoneCount: 2,
      stakeUsdc: 100,
      maxParticipants: 3,
      gracePeriodSeconds: 3600,
    });
    expect(cohort.status).toBe('Open');

    // 2. Alice, Bob, Carol join while Open
    await chain.join('alice', cohort.id);
    await chain.join('bob', cohort.id);
    await chain.join('carol', cohort.id);

    // 4th participant rejected with CohortFull
    await expectChainError(chain.join('dave', cohort.id), 'CohortFull');

    // 3. Creator starts cohort -> status becomes Active
    await chain.startCohort('creator', cohort.id);
    const activeCohort = chain.getCohort(cohort.id)!;
    expect(activeCohort.status).toBe('Active');

    // Joins rejected once Active with CohortNotOpen
    await expectChainError(chain.join('dave', cohort.id), 'CohortNotOpen');

    // --- Milestone 0 ---
    // Alice commits and completes M0
    const aliceHash0 = hashAnswerText('Alice M0 ownership explanation');
    await chain.commitSubmission('alice', cohort.id, 0, aliceHash0);
    const aliceAtt0 = signAttestation({
      programId: activeCohort.programId,
      clusterId: activeCohort.clusterId,
      cohort: activeCohort.id,
      cohortEpoch: activeCohort.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 92,
      commitHash: aliceHash0,
      expiresAt: chain.getNow() + 600,
    });
    await chain.completeMilestone('alice', cohort.id, 0, aliceAtt0);

    // Bob commits and completes M0
    const bobHash0 = hashAnswerText('Bob M0 explanation');
    await chain.commitSubmission('bob', cohort.id, 0, bobHash0);
    const bobAtt0 = signAttestation({
      programId: activeCohort.programId,
      clusterId: activeCohort.clusterId,
      cohort: activeCohort.id,
      cohortEpoch: activeCohort.epoch,
      user: 'bob',
      milestoneIdx: 0,
      score: 80,
      commitHash: bobHash0,
      expiresAt: chain.getNow() + 600,
    });
    await chain.completeMilestone('bob', cohort.id, 0, bobAtt0);

    // Carol commits M0 and completes M0
    const carolHash0 = hashAnswerText('Carol M0 explanation');
    await chain.commitSubmission('carol', cohort.id, 0, carolHash0);
    const carolAtt0 = signAttestation({
      programId: activeCohort.programId,
      clusterId: activeCohort.clusterId,
      cohort: activeCohort.id,
      cohortEpoch: activeCohort.epoch,
      user: 'carol',
      milestoneIdx: 0,
      score: 88,
      commitHash: carolHash0,
      expiresAt: chain.getNow() + 600,
    });
    await chain.completeMilestone('carol', cohort.id, 0, carolAtt0);

    // --- Milestone 1 ---
    // Alice commits and completes M1 (PASSED all)
    const aliceHash1 = hashAnswerText('Alice M1 lifetimes');
    await chain.commitSubmission('alice', cohort.id, 1, aliceHash1);
    const aliceAtt1 = signAttestation({
      programId: activeCohort.programId,
      clusterId: activeCohort.clusterId,
      cohort: activeCohort.id,
      cohortEpoch: activeCohort.epoch,
      user: 'alice',
      milestoneIdx: 1,
      score: 95,
      commitHash: aliceHash1,
      expiresAt: chain.getNow() + 600,
    });
    await chain.completeMilestone('alice', cohort.id, 1, aliceAtt1);

    // Bob does NOT commit M1 (MISSED M1)
    // Carol commits M1, but is NEVER graded (NEUTRAL on M1)
    const carolHash1 = hashAnswerText('Carol M1 unattested commit');
    await chain.commitSubmission('carol', cohort.id, 1, carolHash1);

    // Advance clock past last deadline + grace -> Cohort automatically becomes Settling
    const lastDeadline = activeCohort.deadlines[1];
    chain.setClock(lastDeadline + activeCohort.gracePeriodSeconds + 10);

    const settlingCohort = chain.getCohort(cohort.id)!;
    expect(settlingCohort.status).toBe('Settling');
    expect(chain.getMilestoneOutcome(settlingCohort, 'alice', 1)).toBe('PASSED');
    expect(chain.getMilestoneOutcome(settlingCohort, 'bob', 1)).toBe('MISSED');
    expect(chain.getMilestoneOutcome(settlingCohort, 'carol', 1)).toBe('NEUTRAL');

    // Keeper settles all 3 users
    const keeperBefore = chain.getPersona('keeper')!.usdcBalance;
    const sAlice = await chain.settleUser('keeper', cohort.id, 'alice');
    const sBob = await chain.settleUser('keeper', cohort.id, 'bob');
    const sCarol = await chain.settleUser('keeper', cohort.id, 'carol');

    expect(sAlice.data.missedCount).toBe(0);
    expect(sAlice.data.forfeit).toBe(0n);
    expect(sBob.data.missedCount).toBe(1);
    expect(sBob.data.forfeit).toBe(50n * ONE_USDC);
    expect(sBob.data.bounty).toBe(500_000n); // 0.50 USDC
    expect(sCarol.data.missedCount).toBe(0); // NEUTRAL = no slash!
    expect(sCarol.data.forfeit).toBe(0n);

    // Keeper received 0.50 USDC bounty
    expect(chain.getPersona('keeper')!.usdcBalance - keeperBefore).toBe(500_000n);

    // Finalize cohort
    const { data: econ } = await chain.finalize('keeper', cohort.id);
    expect(econ.invariantHolds).toBe(true);
    expect(econ.totalPayouts + econ.fee + econ.dust).toBe(econ.assets);

    // Claim for Alice, Bob, Carol
    const claimAlice = await chain.claim('alice', cohort.id);
    const claimBob = await chain.claim('bob', cohort.id);
    const claimCarol = await chain.claim('carol', cohort.id);

    // Carol gets exact 100 USDC back (no slash, no reward)
    expect(claimCarol.data.payout).toBe(100n * ONE_USDC);
    // Bob gets 50 USDC back
    expect(claimBob.data.payout).toBe(50n * ONE_USDC);
    // Alice gets 100 USDC + net forfeit after fee + simulated yield
    expect(claimAlice.data.payout).toBeGreaterThan(148n * ONE_USDC);
  });

  it('allows up to 3 re-commits before deadline, requires oracle attestation on latest commit, and classifies failed grade as MISSED', async () => {
    const chain = new MockChain({ initialNow: 2_000_000, persist: false });
    const { data: cohort } = await chain.createCohort('creator', {
      id: 'recommit-test',
      title: 'Recommit & Failed Grade Test',
      durationDays: 2,
      milestoneCount: 2,
      stakeUsdc: 100,
      maxParticipants: 4,
    });
    await chain.join('alice', cohort.id);
    await chain.join('bob', cohort.id);
    await chain.startCohort('creator', cohort.id);

    const h1 = hashAnswerText('attempt 1');
    const h2 = hashAnswerText('attempt 2');
    const h3 = hashAnswerText('attempt 3');
    const h4 = hashAnswerText('attempt 4');

    await chain.commitSubmission('alice', cohort.id, 0, h1);
    await chain.commitSubmission('alice', cohort.id, 0, h2);
    await chain.commitSubmission('alice', cohort.id, 0, h3);

    // 4th attempt before deadline is rejected
    await expectChainError(
      chain.commitSubmission('alice', cohort.id, 0, h4),
      'MaxAttemptsExceeded'
    );

    const c = chain.getCohort(cohort.id)!;
    // Attestation over old commit hash h1 must fail with BadSignature because chain state holds h3
    const staleAtt = signAttestation({
      programId: c.programId,
      clusterId: c.clusterId,
      cohort: c.id,
      cohortEpoch: c.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 90,
      commitHash: h1,
      expiresAt: chain.getNow() + 300,
    });
    await expectChainError(chain.completeMilestone('alice', cohort.id, 0, staleAtt), 'BadSignature');

    // Attestation over latest commit hash h3 succeeds
    const latestAtt = signAttestation({
      programId: c.programId,
      clusterId: c.clusterId,
      cohort: c.id,
      cohortEpoch: c.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 90,
      commitHash: h3,
      expiresAt: chain.getNow() + 300,
    });
    await chain.completeMilestone('alice', cohort.id, 0, latestAtt);

    // Bob commits M0, gets graded 55 (< 75) by oracle, and never passes before window closes
    const bobHash = hashAnswerText('Bob weak answer');
    await chain.commitSubmission('bob', cohort.id, 0, bobHash);
    chain.recordFailedGrade(cohort.id, 'bob', 0, 55);

    // Jump past M0 deadline + grace
    chain.setClock(c.deadlines[0] + c.gracePeriodSeconds + 5);
    expect(chain.getMilestoneOutcome(chain.getCohort(cohort.id)!, 'bob', 0)).toBe('MISSED');
  });

  it('rejects all 9 Security Demo attack vectors + all 14 protocol error codes with exact codes', async () => {
    const chain = new MockChain({ initialNow: 5_000_000, persist: false });
    const { data: cohort } = await chain.createCohort('creator', {
      id: 'sec-cohort',
      title: 'Security Audit Cohort',
      durationDays: 2,
      milestoneCount: 2,
      stakeUsdc: 100,
      maxParticipants: 4,
      gracePeriodSeconds: 600,
    });
    await chain.join('alice', cohort.id);
    await chain.join('bob', cohort.id);
    await chain.startCohort('creator', cohort.id);

    const c = chain.getCohort(cohort.id)!;

    // 0. Complete without committing -> NotCommitted
    const dummyAtt = signAttestation({
      programId: c.programId,
      clusterId: c.clusterId,
      cohort: c.id,
      cohortEpoch: c.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 90,
      commitHash: hashAnswerText('not committed'),
      expiresAt: chain.getNow() + 300,
    });
    await expectChainError(
      chain.completeMilestone('alice', cohort.id, 0, dummyAtt),
      'NotCommitted'
    );

    // Alice commits M0
    const aliceH0 = hashAnswerText('Alice M0 valid answer');
    await chain.commitSubmission('alice', cohort.id, 0, aliceH0);

    // WrongCohort in attestation -> WrongCohort
    const wrongCohortAtt = signAttestation({
      programId: c.programId,
      clusterId: c.clusterId,
      cohort: 'other-cohort',
      cohortEpoch: c.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 88,
      commitHash: aliceH0,
      expiresAt: chain.getNow() + 300,
    });
    await expectChainError(
      chain.completeMilestone('alice', cohort.id, 0, wrongCohortAtt),
      'WrongCohort'
    );

    // Low score (< 75) -> ScoreTooLow
    const lowScoreAtt = signAttestation({
      programId: c.programId,
      clusterId: c.clusterId,
      cohort: c.id,
      cohortEpoch: c.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 65,
      commitHash: aliceH0,
      expiresAt: chain.getNow() + 300,
    });
    await expectChainError(
      chain.completeMilestone('alice', cohort.id, 0, lowScoreAtt),
      'ScoreTooLow'
    );

    // 1. Security Demo #4: Tampered score (signed score=65, client mutates score=95) -> BadSignature
    const tamperedScoreAtt = { ...lowScoreAtt, score: 95 };
    await expectChainError(
      chain.completeMilestone('alice', cohort.id, 0, tamperedScoreAtt),
      'BadSignature'
    );

    // 2. Security Demo #3: Expired attestation -> AttestationExpired
    const expiredAtt = signAttestation({
      programId: c.programId,
      clusterId: c.clusterId,
      cohort: c.id,
      cohortEpoch: c.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 85,
      commitHash: aliceH0,
      expiresAt: chain.getNow() - 10,
    });
    await expectChainError(
      chain.completeMilestone('alice', cohort.id, 0, expiredAtt),
      'AttestationExpired'
    );

    // Valid attestation for Alice M0 succeeds
    const validAliceAtt0 = signAttestation({
      programId: c.programId,
      clusterId: c.clusterId,
      cohort: c.id,
      cohortEpoch: c.epoch,
      user: 'alice',
      milestoneIdx: 0,
      score: 85,
      commitHash: aliceH0,
      expiresAt: chain.getNow() + 500,
    });
    await chain.completeMilestone('alice', cohort.id, 0, validAliceAtt0);

    // 3. Security Demo #1: Replay a used attestation -> AlreadyCompleted
    await expectChainError(
      chain.completeMilestone('alice', cohort.id, 0, validAliceAtt0),
      'AlreadyCompleted'
    );

    // 4. Security Demo #2: Attestation for another user (Bob tries to use Alice's attestation) -> WrongUser
    const bobH0 = hashAnswerText('Bob M0 answer');
    await chain.commitSubmission('bob', cohort.id, 0, bobH0);
    await expectChainError(
      chain.completeMilestone('bob', cohort.id, 0, validAliceAtt0),
      'WrongUser'
    );

    // 5. Security Demo #6: Early settle (before last milestone window closes) -> SettlementTooEarly
    await expectChainError(
      chain.settleUser('keeper', cohort.id, 'alice'),
      'SettlementTooEarly'
    );

    // 6. Security Demo #8: Claim before finalize -> NotFinalized
    await expectChainError(chain.claim('alice', cohort.id), 'NotFinalized');

    // Advance clock past final deadline + grace
    chain.setClock(c.deadlines[1] + c.gracePeriodSeconds + 100);

    // 7. Security Demo #5: Late commit (after deadline) -> SubmissionWindowClosed
    await expectChainError(
      chain.commitSubmission('bob', cohort.id, 1, hashAnswerText('late')),
      'SubmissionWindowClosed'
    );

    // Settle Alice & Bob
    await chain.settleUser('keeper', cohort.id, 'alice');
    await chain.settleUser('keeper', cohort.id, 'bob');

    // 8. Security Demo #7: Duplicate settle -> AlreadySettled
    await expectChainError(
      chain.settleUser('keeper', cohort.id, 'alice'),
      'AlreadySettled'
    );

    // Finalize & Claim
    await chain.finalize('keeper', cohort.id);
    await chain.claim('alice', cohort.id);

    // 9. Security Demo #9: Double claim -> AlreadyClaimed
    await expectChainError(chain.claim('alice', cohort.id), 'AlreadyClaimed');

    expect(getDemoOracleKeypair().publicKeyHex).toHaveLength(64);
  });

  it('executes all 4 Scenario Presets and the 9-row Security Demo runner cleanly', async () => {
    const chain = new MockChain({ initialNow: 8_000_000, persist: false });

    for (const preset of ['all_finish', 'all_fail', 'mixed', 'lender_loss'] as const) {
      const cohort = await runScenarioPresetOnChain(chain, preset);
      expect(cohort.status).toBe('Finalized');
      expect(cohort.economicsSnapshot).toBeDefined();
      expect(cohort.economicsSnapshot!.invariantHolds).toBe(true);
    }

    const sec = await runSecurityDemoOnChain(chain);
    expect(sec.rows).toHaveLength(9);
    expect(sec.rows.every((r) => r.passedCheck)).toBe(true);
  });
});
