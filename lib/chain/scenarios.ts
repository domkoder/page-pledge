import { LAMPORTS_PER_SOL, formatSol } from "../economics";
import { MILESTONE_MATERIALS } from "../oracle/passages";
import { hashAnswerText, signAttestation } from "./attestation";
import {
  ChainClient,
  ChainErrorCode,
  ChainProgramError,
  CohortAccount,
} from "./types";

export type ScenarioPresetId =
  "all_finish" | "all_fail" | "mixed" | "lender_loss";

export interface SecurityDemoRow {
  id: string;
  attempt: string;
  description: string;
  expectedErrorCode: ChainErrorCode;
  actualErrorCode: ChainErrorCode | "NONE";
  passedCheck: boolean;
  txSignature: string;
  detailMessage: string;
}

/**
 * Runs one of the 4 automated Scenario Presets against the provided ChainClient:
 * - all_finish: Alice, Bob, Carol all complete every milestone; 0 forfeits; simulated yield shared.
 * - all_fail: Alice, Bob, Carol all miss milestones (nobody eligible); net forfeits refunded minus 2% fee; yield swept to treasury.
 * - mixed: Alice completes every milestone (PASSED), Bob misses some (MISSED), Carol commits M2 after Alice's M2 completion and is never graded (NEUTRAL).
 * - lender_loss: Mixed outcomes + 25% lender loss (h < 1), demonstrating haircut scaling and Y = 0 while maintaining solvency invariant.
 */
export async function runScenarioPresetOnChain(
  chain: ChainClient,
  preset: ScenarioPresetId
): Promise<CohortAccount> {
  const titles: Record<ScenarioPresetId, string> = {
    all_finish: "Scenario: All Finish (100% Completion)",
    all_fail: "Scenario: All Fail (Nobody Eligible)",
    mixed: "Scenario: Mixed (Finisher + Dropout + Neutral)",
    lender_loss: "Scenario: Lender Loss Haircut (h < 1)",
  };

  const presetStakesSol: Record<ScenarioPresetId, number> = {
    all_finish: 0.5,
    all_fail: 0.1,
    mixed: 1.0,
    lender_loss: 0.5,
  };

  // Configure yield & lender loss for the preset
  chain.setYieldAprBps(500n); // 5.00% APR
  if (preset === "lender_loss") {
    chain.setLenderLossBps(2500n); // 25.00% lender loss
  } else {
    chain.setLenderLossBps(0n);
  }

  // Ensure personas have ample SOL
  for (const user of ["alice", "bob", "carol"]) {
    const p = chain.getPersona(user);
    if (!p || p.lamportsBalance < 2n * LAMPORTS_PER_SOL) {
      await chain.faucet(user, 5n * LAMPORTS_PER_SOL);
    }
  }

  const milestoneCount = 3;
  const { data: created } = await chain.createCohort("creator", {
    title: titles[preset],
    durationDays: 21,
    milestoneCount,
    stakeSol: presetStakesSol[preset],
    maxParticipants: 10,
  });

  const cohortId = created.id;
  await chain.join("alice", cohortId);
  await chain.join("bob", cohortId);
  await chain.join("carol", cohortId);
  await chain.startCohort("creator", cohortId);

  const active = chain.getCohort(cohortId)!;

  const commitAndComplete = async (
    user: string,
    mIdx: number,
    score: number
  ) => {
    const exemplar =
      MILESTONE_MATERIALS[mIdx % MILESTONE_MATERIALS.length].exemplarAnswer;
    const hash = hashAnswerText(`${user}_m${mIdx}_${exemplar}`);
    await chain.commitSubmission(user, cohortId, mIdx, hash, exemplar);
    const att = signAttestation({
      programId: active.programId,
      clusterId: active.clusterId,
      cohort: active.id,
      cohortEpoch: active.epoch,
      user,
      milestoneIdx: mIdx,
      score,
      commitHash: hash,
      expiresAt: chain.getNow() + 3600,
    });
    await chain.completeMilestone(user, cohortId, mIdx, att);
  };

  if (preset === "all_finish") {
    for (let m = 0; m < milestoneCount; m++) {
      await commitAndComplete("alice", m, 95);
      await commitAndComplete("bob", m, 88);
      await commitAndComplete("carol", m, 91);
    }
  } else if (preset === "all_fail") {
    // Alice passes M0, misses M1 & M2
    await commitAndComplete("alice", 0, 84);
    // Bob misses all 3
    // Carol commits M0 with a failing grade (<75) and misses M1, M2
    const badHash = hashAnswerText("carol incomplete answer");
    await chain.commitSubmission("carol", cohortId, 0, badHash, "incomplete");
    chain.recordFailedGrade(cohortId, "carol", 0, 45);
  } else {
    // 'mixed' and 'lender_loss':
    // Alice completes M0, M1, M2 (PASSED)
    // Bob completes M0, misses M1 and M2 (2/3 MISSED)
    // Carol completes M0 and M1, and commits M2 after Alice's completion when the oracle subsequently goes silent (NEUTRAL)
    await commitAndComplete("alice", 0, 94);
    await commitAndComplete("bob", 0, 82);
    await commitAndComplete("carol", 0, 89);

    chain.advanceClock(60);
    await commitAndComplete("alice", 1, 94);
    await commitAndComplete("carol", 1, 86);

    chain.advanceClock(60);
    await commitAndComplete("alice", 2, 94);

    // Advance clock so Carol commits M2 after the last oracle activity (lastOracleTs < carol.commitTimestamp)
    chain.advanceClock(30);
    const carolHash2 = hashAnswerText(
      "Carol M2 committed on time, awaiting oracle"
    );
    await chain.commitSubmission(
      "carol",
      cohortId,
      2,
      carolHash2,
      "Carol M2 committed on time, never graded by oracle"
    );
  }

  // Jump clock past the final milestone deadline + grace
  const finalCohort = chain.getCohort(cohortId)!;
  const lastWindowClose =
    finalCohort.deadlines[milestoneCount - 1] + finalCohort.gracePeriodSeconds;
  chain.setClock(lastWindowClose + 120);

  // Settle all 3 participants via Keeper
  await chain.settleUser("keeper", cohortId, "alice");
  await chain.settleUser("keeper", cohortId, "bob");
  await chain.settleUser("keeper", cohortId, "carol");

  // Finalize cohort
  await chain.finalize("keeper", cohortId);

  // Claim payouts for Alice, Bob, Carol
  await chain.claim("alice", cohortId);
  await chain.claim("bob", cohortId);
  await chain.claim("carol", cohortId);

  return chain.getCohort(cohortId)!;
}

/**
 * Runs the 9 Security Demo exploits against a live cohort
 * and returns a structured table of attempt, expected error code, and actual result.
 */
export async function runSecurityDemoOnChain(chain: ChainClient): Promise<{
  cohortId: string;
  rows: SecurityDemoRow[];
}> {
  for (const user of ["alice", "bob"]) {
    const p = chain.getPersona(user);
    if (!p || p.lamportsBalance < 2n * LAMPORTS_PER_SOL) {
      await chain.faucet(user, 5n * LAMPORTS_PER_SOL);
    }
  }

  const { data: created } = await chain.createCohort("creator", {
    title: "Security Audit Live Target Cohort",
    durationDays: 6,
    milestoneCount: 2,
    stakeSol: 0.5,
    maxParticipants: 5,
    gracePeriodSeconds: 600,
  });

  const cohortId = created.id;
  await chain.join("alice", cohortId);
  await chain.join("bob", cohortId);
  await chain.startCohort("creator", cohortId);

  const cohort = chain.getCohort(cohortId)!;
  const rows: SecurityDemoRow[] = [];

  const captureAttempt = async (
    id: string,
    attempt: string,
    description: string,
    expectedErrorCode: ChainErrorCode,
    fn: () => Promise<unknown>
  ) => {
    try {
      await fn();
      rows.push({
        id,
        attempt,
        description,
        expectedErrorCode,
        actualErrorCode: "NONE",
        passedCheck: false,
        txSignature: "unexpected_success",
        detailMessage: "Exploit unexpectedly succeeded!",
      });
    } catch (err) {
      if (err instanceof ChainProgramError) {
        rows.push({
          id,
          attempt,
          description,
          expectedErrorCode,
          actualErrorCode: err.code,
          passedCheck: err.code === expectedErrorCode,
          txSignature: err.txSignature,
          detailMessage: err.message,
        });
      } else {
        throw err;
      }
    }
  };

  // Setup: Alice and Bob commit M0
  const aliceH0 = hashAnswerText("Alice valid M0 commit");
  const bobH0 = hashAnswerText("Bob valid M0 commit");
  await chain.commitSubmission(
    "alice",
    cohortId,
    0,
    aliceH0,
    "Alice valid M0 commit"
  );
  await chain.commitSubmission(
    "bob",
    cohortId,
    0,
    bobH0,
    "Bob valid M0 commit"
  );

  const validAliceAtt0 = signAttestation({
    programId: cohort.programId,
    clusterId: cohort.clusterId,
    cohort: cohort.id,
    cohortEpoch: cohort.epoch,
    user: "alice",
    milestoneIdx: 0,
    score: 90,
    commitHash: aliceH0,
    expiresAt: chain.getNow() + 600,
  });

  // Alice completes M0 legitimately first so we can test replaying her used attestation
  await chain.completeMilestone("alice", cohortId, 0, validAliceAtt0);

  // 1. Replay a used attestation -> AlreadyCompleted
  await captureAttempt(
    "replay-attestation",
    "1. Replay a used attestation",
    "Alice resubmits the exact same valid M1 attestation after bit 0 in completedBitmap is already set.",
    "AlreadyCompleted",
    () => chain.completeMilestone("alice", cohortId, 0, validAliceAtt0)
  );

  // 2. Attestation for another user -> WrongUser
  await captureAttempt(
    "wrong-user",
    "2. Attestation for another user",
    "Bob submits Alice’s signed oracle attestation to try to pass Bob’s M1.",
    "WrongUser",
    () => chain.completeMilestone("bob", cohortId, 0, validAliceAtt0)
  );

  // 3. Expired attestation -> AttestationExpired
  const expiredBobAtt = signAttestation({
    programId: cohort.programId,
    clusterId: cohort.clusterId,
    cohort: cohort.id,
    cohortEpoch: cohort.epoch,
    user: "bob",
    milestoneIdx: 0,
    score: 85,
    commitHash: bobH0,
    expiresAt: chain.getNow() - 30,
  });
  await captureAttempt(
    "expired-attestation",
    "3. Expired attestation",
    "Bob submits an oracle attestation whose expiresAt timestamp is in the past.",
    "AttestationExpired",
    () => chain.completeMilestone("bob", cohortId, 0, expiredBobAtt)
  );

  // 4. Tampered score -> BadSignature
  const lowBobAtt = signAttestation({
    programId: cohort.programId,
    clusterId: cohort.clusterId,
    cohort: cohort.id,
    cohortEpoch: cohort.epoch,
    user: "bob",
    milestoneIdx: 0,
    score: 55,
    commitHash: bobH0,
    expiresAt: chain.getNow() + 600,
  });
  const tamperedBobAtt = { ...lowBobAtt, score: 98 };
  await captureAttempt(
    "tampered-score",
    "4. Tampered score",
    "Bob intercepts a failing attestation (score=55) and mutates score to 98 in client memory without oracle secret key.",
    "BadSignature",
    () => chain.completeMilestone("bob", cohortId, 0, tamperedBobAtt)
  );

  // 5. Early settle -> SettlementTooEarly
  await captureAttempt(
    "early-settle",
    "5. Early settle",
    "Keeper attempts to settle Bob and extract bounty before the final milestone deadline + grace window closes.",
    "SettlementTooEarly",
    () => chain.settleUser("keeper", cohortId, "bob")
  );

  // 6. Claim before finalize -> NotFinalized
  await captureAttempt(
    "claim-before-finalize",
    "6. Claim before finalize",
    "Alice attempts to withdraw her stake before all users are settled and the cohort is finalized.",
    "NotFinalized",
    () => chain.claim("alice", cohortId)
  );

  // Advance clock past final deadline + grace
  const cAfter = chain.getCohort(cohortId)!;
  chain.setClock(cAfter.deadlines[1] + cAfter.gracePeriodSeconds + 60);

  // 7. Late commit -> SubmissionWindowClosed
  await captureAttempt(
    "late-commit",
    "7. Late commit",
    "Bob tries to commit an answer for Milestone 2 after its deadline has already passed.",
    "SubmissionWindowClosed",
    () =>
      chain.commitSubmission(
        "bob",
        cohortId,
        1,
        hashAnswerText("Bob late commit after deadline")
      )
  );

  // Settle Alice & Bob legitimately
  await chain.settleUser("keeper", cohortId, "alice");
  await chain.settleUser("keeper", cohortId, "bob");

  // 8. Duplicate settle -> AlreadySettled
  await captureAttempt(
    "duplicate-settle",
    "8. Duplicate settle",
    "Keeper tries to settle Bob a second time to drain an extra 1% forfeit bounty from the vault.",
    "AlreadySettled",
    () => chain.settleUser("keeper", cohortId, "bob")
  );

  // Finalize & Claim for Alice
  await chain.finalize("keeper", cohortId);
  const aliceClaim = await chain.claim("alice", cohortId);

  // 9. Double claim -> AlreadyClaimed
  await captureAttempt(
    "double-claim",
    "9. Double claim",
    `Alice attempts to call claim() a second time after already withdrawing ${formatSol(aliceClaim.data.payout)}.`,
    "AlreadyClaimed",
    () => chain.claim("alice", cohortId)
  );

  return { cohortId, rows };
}
