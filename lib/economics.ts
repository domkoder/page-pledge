/**
 * PagePledge Protocol Economics (Pure Functions)
 *
 * All monetary amounts are represented in Native SOL lamports (9 decimals, BigInt).
 * 1 SOL = 1_000_000_000n lamports.
 * No floating-point numbers are used anywhere in accounting calculations.
 */

export const SOL_DECIMALS = 9;
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const BPS_DENOMINATOR = 10_000n;
export const PROTOCOL_FEE_BPS = 200n; // Fixed 2.00% (200 bps) of net forfeits
export const SETTLE_BOUNTY_BPS = 100n; // 1.00% (100 bps) of user's forfeit
export const MAX_SETTLE_BOUNTY = 10_000_000n; // Cap at 0.01 SOL (10_000_000n lamports)
export const SECONDS_PER_YEAR = 31_536_000n; // 365 * 24 * 60 * 60

export type MilestoneOutcome = 'PENDING' | 'COMMITTED' | 'PASSED' | 'MISSED' | 'NEUTRAL';

export interface ParticipantEconomicsInput {
  user: string;
  stake: bigint; // S_i in lamports
  missedCount: number; // missed_i (0..M)
  eligible: boolean; // true iff all M milestones are PASSED
  bountyPaid?: bigint; // Optional override if already settled; otherwise computed via computeSettleBounty
}

export interface EconomicsInput {
  milestoneCount: number; // M (2..10)
  participants: ParticipantEconomicsInput[];
  /**
   * Actual vault balance A at finalize time:
   * deposits + simulatedYield - lenderLoss - B
   * If omitted, defaults to sum(S_i) + simulatedYield - lenderLoss - B.
   */
  vaultAssetsAtFinalize?: bigint;
  simulatedYield?: bigint;
  lenderLoss?: bigint;
}

export interface ParticipantPayoutBreakdown {
  user: string;
  stake: bigint; // S_i
  missedCount: number;
  eligible: boolean;
  forfeit: bigint; // F_i = floor(S_i * missed_i / M)
  bounty: bigint; // bounty_i = min(floor(F_i * 100 / 10000), 10_000_000n)
  netForfeit: bigint; // N_i = F_i - bounty_i
  preservedStakeAfterHaircut: bigint; // floor(h * (S_i - F_i))
  rewardShare: bigint; // Share of Pool (or refund of net forfeit if nobody is eligible)
  payout: bigint; // Total payout_i
}

export interface EconomicsResult {
  milestoneCount: number;
  totalDeposits: bigint; // sum(S_i)
  totalForfeits: bigint; // sum(F_i)
  totalBounties: bigint; // B = sum(bounty_i)
  totalNetForfeits: bigint; // sum(N_i)
  liabilities: bigint; // U = sum(S_i) - B
  assets: bigint; // A = actual vault balance at finalize
  yieldAmount: bigint; // Y = max(A - U, 0n) (0n if h < 1)
  haircutBps: bigint; // Floor representation in bps (10_000n = 1.0)
  haircutNumerator: bigint; // min(U, A) when U > 0
  haircutDenominator: bigint; // U when U > 0
  isHaircut: boolean; // true if A < U
  fee: bigint; // Protocol fee from net forfeits
  pool: bigint; // Reward pool distributed to eligible finishers
  nobodyEligible: boolean; // true when 0 participants passed all M milestones
  treasuryYieldSweep: bigint; // Yield swept to treasury when nobody is eligible
  dust: bigint; // Rounding dust sent to treasury
  treasuryTotal: bigint; // fee + dust (where dust includes treasuryYieldSweep when nobodyEligible)
  totalPayouts: bigint; // sum(payout_i)
  invariantHolds: boolean; // sum(payouts) + fee + dust === A
  invariantDiscrepancy: bigint; // A - (sum(payouts) + fee + dust)
  participants: ParticipantPayoutBreakdown[];
}

/**
 * Computes forfeit F_i = floor(S_i * missed_i / M)
 */
export function computeForfeit(stake: bigint, missedCount: number, milestoneCount: number): bigint {
  if (milestoneCount <= 0) {
    throw new Error('milestoneCount must be > 0');
  }
  if (missedCount <= 0) return 0n;
  if (missedCount >= milestoneCount) return stake;
  return (stake * BigInt(missedCount)) / BigInt(milestoneCount);
}

/**
 * Computes keeper/settler bounty = min(floor(1% of F_i), 0.01 SOL)
 */
export function computeSettleBounty(forfeit: bigint): bigint {
  if (forfeit <= 0n) return 0n;
  const onePercent = (forfeit * SETTLE_BOUNTY_BPS) / BPS_DENOMINATOR;
  return onePercent < MAX_SETTLE_BOUNTY ? onePercent : MAX_SETTLE_BOUNTY;
}

/**
 * Computes simulated yield over elapsed seconds at a given APR (in bps, e.g. 500n = 5.00% APR).
 */
export function computeSimulatedYield(
  totalDeposits: bigint,
  aprBps: bigint,
  elapsedSeconds: bigint
): bigint {
  if (totalDeposits <= 0n || aprBps <= 0n || elapsedSeconds <= 0n) return 0n;
  return (totalDeposits * aprBps * elapsedSeconds) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
}

/**
 * Computes lender loss from total deposits (or gross vault balance) given a loss percentage in bps.
 */
export function computeLenderLoss(principal: bigint, lossBps: bigint): bigint {
  if (principal <= 0n || lossBps <= 0n) return 0n;
  const clampedBps = lossBps > BPS_DENOMINATOR ? BPS_DENOMINATOR : lossBps;
  return (principal * clampedBps) / BPS_DENOMINATOR;
}

/**
 * Applies haircut h = min(1, A / U) using exact integer floor division.
 */
function applyHaircut(amount: bigint, assets: bigint, liabilities: bigint): bigint {
  if (amount <= 0n) return 0n;
  if (liabilities <= 0n) return 0n;
  if (assets >= liabilities) return amount;
  if (assets <= 0n) return 0n;
  return (amount * assets) / liabilities;
}

/**
 * Core protocol settlement and payout calculator.
 * Enforces the invariant: sum(payouts) + fee + dust === A
 */
export function computeCohortEconomics(input: EconomicsInput): EconomicsResult {
  const { milestoneCount, participants } = input;
  const feeBps = PROTOCOL_FEE_BPS; // Protocol fee is fixed at 200 bps and not user-settable

  if (milestoneCount < 2 || milestoneCount > 10) {
    throw new Error(`Invalid milestoneCount: ${milestoneCount}. Must be between 2 and 10.`);
  }

  // 1. Per-user forfeits, bounties, and net forfeits
  const prelim = participants.map((p) => {
    if (p.stake < 0n) throw new Error(`Negative stake for user ${p.user}`);
    if (p.missedCount < 0 || p.missedCount > milestoneCount) {
      throw new Error(`Invalid missedCount ${p.missedCount} for user ${p.user}`);
    }
    // If a user missed any milestone, they cannot be eligible
    const eligible = p.missedCount === 0 && p.eligible;
    const forfeit = computeForfeit(p.stake, p.missedCount, milestoneCount);
    const bounty = p.bountyPaid !== undefined ? p.bountyPaid : computeSettleBounty(forfeit);
    const netForfeit = forfeit - bounty;

    return {
      user: p.user,
      stake: p.stake,
      missedCount: p.missedCount,
      eligible,
      forfeit,
      bounty,
      netForfeit,
    };
  });

  const totalDeposits = prelim.reduce((acc, p) => acc + p.stake, 0n);
  const totalForfeits = prelim.reduce((acc, p) => acc + p.forfeit, 0n);
  const totalBounties = prelim.reduce((acc, p) => acc + p.bounty, 0n);
  const totalNetForfeits = prelim.reduce((acc, p) => acc + p.netForfeit, 0n);

  // 2. Liabilities U = sum(S_i) - B
  const liabilities = totalDeposits - totalBounties;

  // 3. Assets A = actual vault balance at finalize
  const simYield = input.simulatedYield ?? 0n;
  const lenderLoss = input.lenderLoss ?? 0n;
  const rawAssets =
    input.vaultAssetsAtFinalize !== undefined
      ? input.vaultAssetsAtFinalize
      : totalDeposits + simYield - lenderLoss - totalBounties;
  const assets = rawAssets > 0n ? rawAssets : 0n;

  // 4. Yield Y = max(A - U, 0). Haircut h = min(1, A / U). If h < 1 then Y = 0.
  const isHaircut = assets < liabilities;
  const yieldAmount = isHaircut ? 0n : assets - liabilities;
  const haircutNumerator = isHaircut ? assets : liabilities;
  const haircutDenominator = liabilities > 0n ? liabilities : 1n;
  const haircutBps =
    liabilities > 0n
      ? isHaircut
        ? (assets * BPS_DENOMINATOR) / liabilities
        : BPS_DENOMINATOR
      : BPS_DENOMINATOR;

  // 5. Fee and Pool
  // Raw fee is phi * sum(N_i). Under haircut (A < U), scale by h so fee + payouts never exceed A.
  const rawFee = (totalNetForfeits * feeBps) / BPS_DENOMINATOR;
  const fee = applyHaircut(rawFee, assets, liabilities);

  // (1 - phi) * sum(N_i) = sum(N_i) - rawFee
  const rawNetAfterFee = totalNetForfeits - rawFee;
  const eligibleStakeSum = prelim
    .filter((p) => p.eligible)
    .reduce((acc, p) => acc + p.stake, 0n);
  const nobodyEligible = eligibleStakeSum === 0n;

  const poolFromForfeits = applyHaircut(rawNetAfterFee, assets, liabilities);
  const pool = nobodyEligible ? 0n : poolFromForfeits + yieldAmount;
  const treasuryYieldSweep = nobodyEligible ? yieldAmount : 0n;

  // 6. Per-participant payouts
  const participantBreakdowns: ParticipantPayoutBreakdown[] = prelim.map((p) => {
    const preservedStakeAfterHaircut = applyHaircut(p.stake - p.forfeit, assets, liabilities);

    let rewardShare = 0n;
    if (nobodyEligible) {
      // If nobody is eligible: each user also gets back floor(h * (1 - phi) * N_i), and Y goes to treasury
      const userNetAfterFee =
        (p.netForfeit * (BPS_DENOMINATOR - feeBps)) / BPS_DENOMINATOR;
      rewardShare = applyHaircut(userNetAfterFee, assets, liabilities);
    } else if (p.eligible) {
      // Eligible user receives Pool * S_i / sum(S_j over eligible j)
      rewardShare = (pool * p.stake) / eligibleStakeSum;
    }

    const payout = preservedStakeAfterHaircut + rewardShare;

    return {
      user: p.user,
      stake: p.stake,
      missedCount: p.missedCount,
      eligible: p.eligible,
      forfeit: p.forfeit,
      bounty: p.bounty,
      netForfeit: p.netForfeit,
      preservedStakeAfterHaircut,
      rewardShare,
      payout,
    };
  });

  const totalPayouts = participantBreakdowns.reduce((acc, p) => acc + p.payout, 0n);

  // 7. Floor all divisions and send dust to the treasury.
  // When nobody is eligible, Y also goes to the treasury (included in dust / treasuryTotal).
  const dust = assets - totalPayouts - fee;
  const treasuryTotal = fee + dust;
  const invariantDiscrepancy = assets - (totalPayouts + fee + dust);
  const invariantHolds = dust >= 0n && invariantDiscrepancy === 0n;

  if (!invariantHolds) {
    throw new Error(
      `Economics invariant violated: payouts(${totalPayouts}) + fee(${fee}) + dust(${dust}) !== assets(${assets})`
    );
  }

  return {
    milestoneCount,
    totalDeposits,
    totalForfeits,
    totalBounties,
    totalNetForfeits,
    liabilities,
    assets,
    yieldAmount,
    haircutBps,
    haircutNumerator,
    haircutDenominator,
    isHaircut,
    fee,
    pool,
    nobodyEligible,
    treasuryYieldSweep,
    dust,
    treasuryTotal,
    totalPayouts,
    invariantHolds,
    invariantDiscrepancy,
    participants: participantBreakdowns,
  };
}

/**
 * Formats lamports (BigInt) into a human-readable string like "1.00 SOL" or "0.123456789 SOL"
 * using integer string arithmetic only (no float conversion).
 */
export function formatSol(
  lamports: bigint,
  options: { minDecimals?: number; maxDecimals?: number; suffix?: boolean } = {}
): string {
  const { minDecimals = 2, maxDecimals = 4, suffix = true } = options;
  const isNegative = lamports < 0n;
  const abs = isNegative ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const frac = abs % LAMPORTS_PER_SOL;

  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracFull = frac.toString().padStart(SOL_DECIMALS, '0');
  const trimmedFrac = fracFull.slice(0, maxDecimals).replace(/0+$/, '');
  const paddedFrac = trimmedFrac.padEnd(minDecimals, '0');

  const sign = isNegative ? '-' : '';
  const numStr = paddedFrac.length > 0 ? `${sign}${wholeStr}.${paddedFrac}` : `${sign}${wholeStr}`;
  return suffix ? `${numStr} SOL` : numStr;
}

/**
 * Parses a decimal string or number of SOL into lamports BigInt without floats.
 */
export function parseSolToLamports(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  const str = String(value).trim();
  if (!/^\d+(\.\d{1,9})?$/.test(str)) {
    throw new Error(`Invalid SOL amount: "${str}"`);
  }
  const [wholePart, fracPart = ''] = str.split('.');
  const paddedFrac = fracPart.padEnd(SOL_DECIMALS, '0').slice(0, SOL_DECIMALS);
  return BigInt(wholePart) * LAMPORTS_PER_SOL + BigInt(paddedFrac);
}
