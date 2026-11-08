import { describe, expect, it } from "vitest";
import {
  BPS_DENOMINATOR,
  LAMPORTS_PER_SOL,
  MAX_SETTLE_BOUNTY,
  PROTOCOL_FEE_BPS,
  SOL_DECIMALS,
  computeCohortEconomics,
  computeForfeit,
  computeLenderLoss,
  computeSettleBounty,
  computeSimulatedYield,
  formatSol,
  parseSolToLamports,
} from "../economics";

describe("PagePledge Protocol Economics (lib/economics.ts)", () => {
  it("1. All finish: zero forfeits, zero fee, full stakes + yield distributed pro-rata", () => {
    const stake = 1n * LAMPORTS_PER_SOL; // 1.0 SOL each
    const simYield = 60_000_000n; // 0.06 SOL simulated yield
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: simYield,
      participants: [
        { user: "alice", stake, missedCount: 0, eligible: true },
        { user: "bob", stake, missedCount: 0, eligible: true },
        { user: "carol", stake, missedCount: 0, eligible: true },
      ],
    });

    expect(res.totalDeposits).toBe(3n * LAMPORTS_PER_SOL);
    expect(res.totalForfeits).toBe(0n);
    expect(res.totalBounties).toBe(0n);
    expect(res.fee).toBe(0n);
    expect(res.pool).toBe(60_000_000n);
    expect(res.participants.every((p) => p.payout === 1_020_000_000n)).toBe(
      true
    );
    expect(res.dust).toBe(0n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it("2. All fail (nobody eligible): each user gets back h * (1 - phi) * N_i + preserved stake, and Y goes to treasury", () => {
    const stake = 1n * LAMPORTS_PER_SOL; // 1.0 SOL each
    const simYield = 50_000_000n; // 0.05 SOL
    // Alice misses 2/4 (forfeit 0.5 SOL), Bob misses 4/4 (forfeit 1.0 SOL)
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: simYield,
      participants: [
        { user: "alice", stake, missedCount: 2, eligible: false },
        { user: "bob", stake, missedCount: 4, eligible: false },
      ],
    });

    expect(res.nobodyEligible).toBe(true);
    expect(res.pool).toBe(0n);
    expect(res.treasuryYieldSweep).toBe(simYield);

    // Alice: F_1 = 0.5 SOL (500_000_000n), bounty_1 = 0.005 SOL (5_000_000n), N_1 = 0.495 SOL (495_000_000n)
    // Fee_1 = 2% of 0.495 = 0.0099 SOL (9_900_000n), refunded from N_1 = 0.4851 SOL (485_100_000n)
    // Total payout Alice = preserved (0.5 SOL) + 0.4851 SOL = 0.9851 SOL (985_100_000n)
    const alice = res.participants[0];
    expect(alice.forfeit).toBe(500_000_000n);
    expect(alice.bounty).toBe(5_000_000n);
    expect(alice.netForfeit).toBe(495_000_000n);
    expect(alice.payout).toBe(985_100_000n);

    // Bob: F_2 = 1.0 SOL (1_000_000_000n), bounty_2 = 0.01 SOL (10_000_000n, capped), N_2 = 0.99 SOL (990_000_000n)
    // Fee_2 = 2% of 0.99 = 0.0198 SOL (19_800_000n), refunded from N_2 = 0.9702 SOL (970_200_000n)
    // Total payout Bob = preserved (0) + 0.9702 SOL = 0.9702 SOL (970_200_000n)
    const bob = res.participants[1];
    expect(bob.forfeit).toBe(1_000_000_000n);
    expect(bob.bounty).toBe(10_000_000n);
    expect(bob.netForfeit).toBe(990_000_000n);
    expect(bob.payout).toBe(970_200_000n);

    // Yield Y = 0.05 SOL swept to treasury inside dust
    expect(res.dust).toBe(simYield);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it("3. Mixed with a NEUTRAL user: NEUTRAL has 0 slash on neutral milestone and is not eligible for reward pool", () => {
    const stake = 1n * LAMPORTS_PER_SOL;
    // Alice: 4/4 PASSED -> missed 0, eligible = true
    // Bob: 2/4 MISSED -> missed 2, eligible = false
    // Carol: 3 PASSED + 1 NEUTRAL (committed, never graded) -> missed 0, eligible = false
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: 0n,
      participants: [
        { user: "alice", stake, missedCount: 0, eligible: true },
        { user: "bob", stake, missedCount: 2, eligible: false },
        { user: "carol", stake, missedCount: 0, eligible: false },
      ],
    });

    const [alice, bob, carol] = res.participants;

    // Carol is NEUTRAL: 0 forfeit, gets exact 1.0 SOL back, 0 reward share
    expect(carol.forfeit).toBe(0n);
    expect(carol.rewardShare).toBe(0n);
    expect(carol.payout).toBe(1n * LAMPORTS_PER_SOL);

    // Bob forfeited 0.5 SOL, bounty = 0.005 SOL, net forfeit = 0.495 SOL
    expect(bob.forfeit).toBe(500_000_000n);
    expect(bob.bounty).toBe(5_000_000n);
    expect(bob.payout).toBe(500_000_000n);

    // Fee = 2% of 0.495 SOL = 0.0099 SOL. Pool = 0.4851 SOL -> all goes to Alice!
    expect(res.fee).toBe(9_900_000n);
    expect(res.pool).toBe(485_100_000n);
    expect(alice.payout).toBe(1_485_100_000n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it("4. Lender loss (h < 1): sets Y = 0 and scales preserved stake, pool, and fee by haircut h = A / U", () => {
    const stake = 1n * LAMPORTS_PER_SOL;
    // 2 users, 2.0 SOL total deposits. Lender loss = 0.4 SOL (20% loss), simulated yield = 0.1 SOL
    // Net loss = 0.3 SOL -> A < U so Y = 0 and haircut applies
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: 100_000_000n,
      lenderLoss: 400_000_000n,
      participants: [
        { user: "alice", stake, missedCount: 0, eligible: true },
        { user: "bob", stake, missedCount: 2, eligible: false },
      ],
    });

    expect(res.isHaircut).toBe(true);
    expect(res.yieldAmount).toBe(0n);
    expect(res.assets).toBeLessThan(res.liabilities);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it("5. Rounding dust: indivisible prime stakes and milestone counts floor all divisions and route dust to treasury", () => {
    const res = computeCohortEconomics({
      milestoneCount: 3,
      simulatedYield: 14n, // 14 lamports creates non-zero remainder mod 3
      participants: [
        { user: "alice", stake: 100_000_007n, missedCount: 0, eligible: true },
        { user: "bob", stake: 100_000_007n, missedCount: 0, eligible: true },
        { user: "carol", stake: 100_000_007n, missedCount: 0, eligible: true },
        { user: "dave", stake: 100_000_007n, missedCount: 1, eligible: false },
      ],
    });

    expect(res.dust).toBeGreaterThan(0n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it("6. Single finisher: captures 100% of the reward pool from multiple defaulters", () => {
    const stake = 2_500_000_000n; // 2.5 SOL so 100% forfeit (2.5 SOL) and 60% forfeit (1.5 SOL) both hit the 0.01 SOL bounty cap!
    const res = computeCohortEconomics({
      milestoneCount: 5,
      simulatedYield: 125_000_000n,
      participants: [
        { user: "finisher", stake, missedCount: 0, eligible: true },
        { user: "drop1", stake, missedCount: 5, eligible: false },
        { user: "drop2", stake, missedCount: 3, eligible: false },
      ],
    });

    // drop1 forfeit = 2.5 SOL -> bounty capped at 0.01 SOL (10_000_000n)
    expect(res.participants[1].bounty).toBe(MAX_SETTLE_BOUNTY);
    // drop2 forfeit = 1.5 SOL -> bounty capped at 0.01 SOL (10_000_000n)
    expect(res.participants[2].bounty).toBe(MAX_SETTLE_BOUNTY);
    // Finisher captures the entire pool
    expect(res.participants[0].rewardShare).toBe(res.pool);
    expect(res.dust).toBe(0n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it("7. Max-size cohort (50 participants, 10 milestones): reconciles to the exact lamport", () => {
    const participants = Array.from({ length: 50 }, (_, idx) => {
      const missedCount = idx % 11; // 0..10
      const eligible = missedCount === 0 && idx % 3 !== 0; // mix of eligible and NEUTRAL
      return {
        user: `user_${idx + 1}`,
        stake: BigInt(100_000_000 + idx * 70_000_000) + BigInt(idx * 137),
        missedCount,
        eligible,
      };
    });

    const res = computeCohortEconomics({
      milestoneCount: 10,
      simulatedYield: 421_234_567n,
      lenderLoss: 50_000_000n,
      participants,
    });

    expect(res.participants).toHaveLength(50);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it("8. Randomized property test: invariant sum(payouts) + fee + dust === A holds across 250 random cohorts", () => {
    // Deterministic PRNG (Mulberry32) so tests are 100% reproducible
    let seed = 0xdecafbad;
    const nextRand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const randInt = (min: number, max: number) =>
      Math.floor(nextRand() * (max - min + 1)) + min;

    for (let run = 0; run < 250; run++) {
      const milestoneCount = randInt(2, 10);
      const participantCount = randInt(2, 50);
      const participants = Array.from(
        { length: participantCount },
        (_, idx) => {
          const missedCount = randInt(0, milestoneCount);
          const isNeutral = missedCount === 0 && nextRand() < 0.25;
          const stakeLamports = BigInt(randInt(50_000_000, 1_500_000_000));
          return {
            user: `p_${idx}`,
            stake: stakeLamports,
            missedCount,
            eligible: missedCount === 0 && !isNeutral,
          };
        }
      );

      const totalDeposits = participants.reduce((acc, p) => acc + p.stake, 0n);
      const simulatedYield =
        nextRand() < 0.7 ? BigInt(randInt(0, Number(totalDeposits / 10n))) : 0n;
      const lenderLoss =
        nextRand() < 0.4 ? BigInt(randInt(0, Number(totalDeposits))) : 0n;

      const res = computeCohortEconomics({
        milestoneCount,
        simulatedYield,
        lenderLoss,
        participants,
      });

      expect(res.invariantHolds).toBe(true);
      expect(res.dust).toBeGreaterThanOrEqual(0n);
      expect(res.fee).toBeGreaterThanOrEqual(0n);
      expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
      for (const p of res.participants) {
        expect(p.payout).toBeGreaterThanOrEqual(0n);
        expect(p.netForfeit).toBe(p.forfeit - p.bounty);
      }
    }
  });

  it("helper utilities: computeForfeit, computeSettleBounty, computeSimulatedYield, computeLenderLoss, formatSol, parseSolToLamports", () => {
    expect(computeForfeit(1n * LAMPORTS_PER_SOL, 0, 4)).toBe(0n);
    expect(computeForfeit(1n * LAMPORTS_PER_SOL, 1, 4)).toBe(250_000_000n);
    expect(computeForfeit(1n * LAMPORTS_PER_SOL, 4, 4)).toBe(
      1n * LAMPORTS_PER_SOL
    );

    expect(computeSettleBounty(0n)).toBe(0n);
    expect(computeSettleBounty(500_000_000n)).toBe(5_000_000n); // 0.005 SOL
    expect(computeSettleBounty(5n * LAMPORTS_PER_SOL)).toBe(MAX_SETTLE_BOUNTY); // capped at 0.01 SOL (10_000_000n)

    // 10 SOL at 5% APR (500 bps) for 1 full year = 0.5 SOL
    expect(
      computeSimulatedYield(10n * LAMPORTS_PER_SOL, 500n, 31_536_000n)
    ).toBe(500_000_000n);
    expect(computeLenderLoss(10n * LAMPORTS_PER_SOL, 2500n)).toBe(
      2_500_000_000n
    );

    expect(formatSol(1_250_000_000n)).toBe("1.25 SOL");
    expect(parseSolToLamports("1.25")).toBe(1_250_000_000n);
    expect(SOL_DECIMALS).toBe(9);
    expect(LAMPORTS_PER_SOL).toBe(1_000_000_000n);
    expect(MAX_SETTLE_BOUNTY).toBe(10_000_000n);
    expect(PROTOCOL_FEE_BPS).toBe(200n);
    expect(BPS_DENOMINATOR).toBe(10_000n);
  });
});
