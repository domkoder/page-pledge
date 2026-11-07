import { describe, expect, it } from 'vitest';
import {
  BPS_DENOMINATOR,
  ONE_USDC,
  PROTOCOL_FEE_BPS,
  computeCohortEconomics,
  computeForfeit,
  computeLenderLoss,
  computeSettleBounty,
  computeSimulatedYield,
  formatUsdc,
  parseUsdc,
} from '../economics';

describe('PagePledge Protocol Economics (lib/economics.ts)', () => {
  it('1. All finish: zero forfeits, zero fee, full stakes + yield distributed pro-rata', () => {
    const stake = 100n * ONE_USDC; // 100 USDC each
    const simYield = 6n * ONE_USDC; // 6 USDC simulated yield
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: simYield,
      participants: [
        { user: 'alice', stake, missedCount: 0, eligible: true },
        { user: 'bob', stake, missedCount: 0, eligible: true },
        { user: 'carol', stake, missedCount: 0, eligible: true },
      ],
    });

    expect(res.totalDeposits).toBe(300n * ONE_USDC);
    expect(res.totalForfeits).toBe(0n);
    expect(res.totalBounties).toBe(0n);
    expect(res.fee).toBe(0n);
    expect(res.pool).toBe(6n * ONE_USDC);
    expect(res.participants.every((p) => p.payout === 102n * ONE_USDC)).toBe(true);
    expect(res.dust).toBe(0n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it('2. All fail (nobody eligible): each user gets back h * (1 - phi) * N_i + preserved stake, and Y goes to treasury', () => {
    const stake = 100n * ONE_USDC;
    const simYield = 5n * ONE_USDC;
    // Alice misses 2/4 (forfeit 50 USDC), Bob misses 4/4 (forfeit 100 USDC)
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: simYield,
      participants: [
        { user: 'alice', stake, missedCount: 2, eligible: false },
        { user: 'bob', stake, missedCount: 4, eligible: false },
      ],
    });

    expect(res.nobodyEligible).toBe(true);
    expect(res.pool).toBe(0n);
    expect(res.treasuryYieldSweep).toBe(simYield);

    // Alice: F_1 = 50 USDC, bounty_1 = 0.50 USDC (500_000n), N_1 = 49.50 USDC
    // Fee_1 = 2% of 49.50 = 0.99 USDC (990_000n), refunded from N_1 = 48.51 USDC
    // Total payout Alice = preserved (50 USDC) + 48.51 USDC = 98.51 USDC
    const alice = res.participants[0];
    expect(alice.forfeit).toBe(50n * ONE_USDC);
    expect(alice.bounty).toBe(500_000n);
    expect(alice.netForfeit).toBe(49_500_000n);
    expect(alice.payout).toBe(98_510_000n);

    // Bob: F_2 = 100 USDC, bounty_2 = 1.00 USDC (capped), N_2 = 99.00 USDC
    // Fee_2 = 2% of 99.00 = 1.98 USDC, refunded from N_2 = 97.02 USDC
    // Total payout Bob = preserved (0) + 97.02 USDC = 97.02 USDC
    const bob = res.participants[1];
    expect(bob.forfeit).toBe(100n * ONE_USDC);
    expect(bob.bounty).toBe(1_000_000n);
    expect(bob.netForfeit).toBe(99_000_000n);
    expect(bob.payout).toBe(97_020_000n);

    // Yield Y = 5 USDC swept to treasury inside dust
    expect(res.dust).toBe(simYield);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it('3. Mixed with a NEUTRAL user: NEUTRAL has 0 slash on neutral milestone and is not eligible for reward pool', () => {
    const stake = 100n * ONE_USDC;
    // Alice: 4/4 PASSED -> missed 0, eligible = true
    // Bob: 2/4 MISSED -> missed 2, eligible = false
    // Carol: 3 PASSED + 1 NEUTRAL (committed, never graded) -> missed 0, eligible = false
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: 0n,
      participants: [
        { user: 'alice', stake, missedCount: 0, eligible: true },
        { user: 'bob', stake, missedCount: 2, eligible: false },
        { user: 'carol', stake, missedCount: 0, eligible: false },
      ],
    });

    const [alice, bob, carol] = res.participants;

    // Carol is NEUTRAL: 0 forfeit, gets exact 100 USDC back, 0 reward share
    expect(carol.forfeit).toBe(0n);
    expect(carol.rewardShare).toBe(0n);
    expect(carol.payout).toBe(100n * ONE_USDC);

    // Bob forfeited 50 USDC, bounty = 0.50 USDC, net forfeit = 49.50 USDC
    expect(bob.forfeit).toBe(50n * ONE_USDC);
    expect(bob.bounty).toBe(500_000n);
    expect(bob.payout).toBe(50n * ONE_USDC);

    // Fee = 2% of 49.50 USDC = 0.99 USDC. Pool = 48.51 USDC -> all goes to Alice!
    expect(res.fee).toBe(990_000n);
    expect(res.pool).toBe(48_510_000n);
    expect(alice.payout).toBe(148_510_000n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it('4. Lender loss (h < 1): sets Y = 0 and scales preserved stake, pool, and fee by haircut h = A / U', () => {
    const stake = 100n * ONE_USDC;
    // 2 users, 200 USDC total deposits. Lender loss = 40 USDC (20% loss), simulated yield = 10 USDC
    // Net loss = 30 USDC -> A < U so Y = 0 and haircut applies
    const res = computeCohortEconomics({
      milestoneCount: 4,
      simulatedYield: 10n * ONE_USDC,
      lenderLoss: 40n * ONE_USDC,
      participants: [
        { user: 'alice', stake, missedCount: 0, eligible: true },
        { user: 'bob', stake, missedCount: 2, eligible: false },
      ],
    });

    expect(res.isHaircut).toBe(true);
    expect(res.yieldAmount).toBe(0n);
    expect(res.assets).toBeLessThan(res.liabilities);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it('5. Rounding dust: indivisible prime stakes and milestone counts floor all divisions and route dust to treasury', () => {
    const res = computeCohortEconomics({
      milestoneCount: 3,
      simulatedYield: 14n, // 14 micro-USDC creates non-zero remainder mod 3
      participants: [
        { user: 'alice', stake: 10_000_007n, missedCount: 0, eligible: true },
        { user: 'bob', stake: 10_000_007n, missedCount: 0, eligible: true },
        { user: 'carol', stake: 10_000_007n, missedCount: 0, eligible: true },
        { user: 'dave', stake: 10_000_007n, missedCount: 1, eligible: false },
      ],
    });

    expect(res.dust).toBeGreaterThan(0n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it('6. Single finisher: captures 100% of the reward pool from multiple defaulters', () => {
    const stake = 250n * ONE_USDC; // 250 USDC so 100% forfeit hits the 1 USDC bounty cap!
    const res = computeCohortEconomics({
      milestoneCount: 5,
      simulatedYield: 12_500_000n,
      participants: [
        { user: 'finisher', stake, missedCount: 0, eligible: true },
        { user: 'drop1', stake, missedCount: 5, eligible: false },
        { user: 'drop2', stake, missedCount: 3, eligible: false },
      ],
    });

    // drop1 forfeit = 250 USDC -> bounty capped at 1 USDC (1_000_000n)
    expect(res.participants[1].bounty).toBe(ONE_USDC);
    // drop2 forfeit = 150 USDC -> bounty capped at 1 USDC (1_000_000n)
    expect(res.participants[2].bounty).toBe(ONE_USDC);
    // Finisher captures the entire pool
    expect(res.participants[0].rewardShare).toBe(res.pool);
    expect(res.dust).toBe(0n);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it('7. Max-size cohort (50 participants, 10 milestones): reconciles to the exact micro-USDC', () => {
    const participants = Array.from({ length: 50 }, (_, idx) => {
      const missedCount = idx % 11; // 0..10
      const eligible = missedCount === 0 && idx % 3 !== 0; // mix of eligible and NEUTRAL
      return {
        user: `user_${idx + 1}`,
        stake: BigInt(10 + idx * 7) * ONE_USDC + BigInt(idx * 137),
        missedCount,
        eligible,
      };
    });

    const res = computeCohortEconomics({
      milestoneCount: 10,
      simulatedYield: 42_123_456n,
      lenderLoss: 5_000_000n,
      participants,
    });

    expect(res.participants).toHaveLength(50);
    expect(res.invariantHolds).toBe(true);
    expect(res.totalPayouts + res.fee + res.dust).toBe(res.assets);
  });

  it('8. Randomized property test: invariant sum(payouts) + fee + dust === A holds across 250 random cohorts', () => {
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
      const participants = Array.from({ length: participantCount }, (_, idx) => {
        const missedCount = randInt(0, milestoneCount);
        const isNeutral = missedCount === 0 && nextRand() < 0.25;
        const stakeMicro = BigInt(randInt(1_000_000, 500_000_000));
        return {
          user: `p_${idx}`,
          stake: stakeMicro,
          missedCount,
          eligible: missedCount === 0 && !isNeutral,
        };
      });

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

  it('helper utilities: computeForfeit, computeSettleBounty, computeSimulatedYield, computeLenderLoss, formatUsdc, parseUsdc', () => {
    expect(computeForfeit(100n * ONE_USDC, 0, 4)).toBe(0n);
    expect(computeForfeit(100n * ONE_USDC, 1, 4)).toBe(25n * ONE_USDC);
    expect(computeForfeit(100n * ONE_USDC, 4, 4)).toBe(100n * ONE_USDC);

    expect(computeSettleBounty(0n)).toBe(0n);
    expect(computeSettleBounty(50n * ONE_USDC)).toBe(500_000n); // 0.50 USDC
    expect(computeSettleBounty(500n * ONE_USDC)).toBe(ONE_USDC); // capped at 1.00 USDC

    // 1000 USDC at 5% APR (500 bps) for 1 full year = 50 USDC
    expect(computeSimulatedYield(1000n * ONE_USDC, 500n, 31_536_000n)).toBe(50n * ONE_USDC);
    expect(computeLenderLoss(1000n * ONE_USDC, 2500n)).toBe(250n * ONE_USDC);

    expect(formatUsdc(123_450_000n)).toBe('123.45 USDC');
    expect(parseUsdc('123.45')).toBe(123_450_000n);
    expect(PROTOCOL_FEE_BPS).toBe(200n);
    expect(BPS_DENOMINATOR).toBe(10_000n);
  });
});
