import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import {
  generateKeyPairSigner,
  getBase58Encoder,
  getBase64Decoder,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import * as vault from "@/app/generated/vault";
import {
  ED25519_PROGRAM_ADDRESS,
  PROGRAM_ERROR_NAMES,
  SolanaChain,
  buildEd25519InstructionData,
  extractCustomErrorCode,
  makeCohortId,
  mapProgramError,
  type ChainRpc,
} from "../chain/solana-chain";
import { ChainProgramError } from "../chain/types";
import {
  bytesToHex,
  getDemoOracleKeypair,
  hexToBytes,
  signAttestation,
} from "../chain/attestation";

const NOW = 1_800_000_000;
const STAKE = 100_000_000n; // 0.1 SOL
const RESERVE = 890_880n;
const ID = "rust-101";

type CohortArgs = Parameters<
  ReturnType<typeof vault.getCohortEncoder>["encode"]
>[0];
type ParticipantArgs = Parameters<
  ReturnType<typeof vault.getParticipantEncoder>["encode"]
>[0];

async function setup(now = NOW + 10) {
  const [creator, alice, bob, keeper, treasury] = await Promise.all(
    Array.from({ length: 5 }, () => generateKeyPairSigner())
  );
  const [cohortPda] = await vault.findCohortPda({
    creator: creator!.address,
    id: ID,
  });
  const [vaultPda] = await vault.findVaultPda({ cohort: cohortPda });
  const pda = async (u: TransactionSigner) =>
    (await vault.findParticipantPda({ cohort: cohortPda, user: u.address }))[0];
  const participantPdas = new Map<string, Address>([
    [alice!.address, await pda(alice!)],
    [bob!.address, await pda(bob!)],
    [creator!.address, await pda(creator!)],
  ]);

  const world = {
    cohort: {
      id: ID,
      title: "Rust 101",
      creator: creator!.address,
      epoch: NOW,
      stake: STAKE,
      milestoneCount: 2,
      maxParticipants: 5,
      intervalSeconds: 120n,
      deadlines: [NOW + 120, NOW + 240, 0, 0, 0, 0, 0, 0, 0, 0],
      gracePeriodSeconds: 60n,
      contentHash: new Uint8Array(32).fill(1),
      oraclePubkey: getDemoOracleKeypair().publicKey,
      treasury: treasury!.address,
      vaultRentReserve: RESERVE,
      status: 1,
      startedAt: NOW,
      lastOracleTs: 0,
      participantCount: 2,
      totalDeposits: 2n * STAKE,
      settledCount: 0,
      totalForfeits: 0,
      totalBountiesPaid: 0,
      totalNetForfeits: 0,
      eligibleCount: 0,
      eligibleStakeSum: 0,
      totalPreservedStakes: 0,
      totalNoEligibleRefunds: 0,
      finalizedAssets: 0,
      finalizedLiabilities: 0,
      finalizedPool: 0,
      finalizedFee: 0,
      finalizedDust: 0,
      claimedCount: 0,
      bump: 255,
      vaultBump: 254,
    } as CohortArgs,
    participants: new Map<string, ParticipantArgs>(),
    balances: new Map<string, bigint>([[vaultPda, RESERVE + 2n * STAKE]]),
  };
  const participant = (
    user: TransactionSigner,
    o: Partial<ParticipantArgs> = {}
  ): ParticipantArgs => ({
    cohort: cohortPda,
    user: user.address,
    stake: STAKE,
    joinedAt: NOW,
    completedBitmap: 0,
    attemptCounts: new Uint8Array(10),
    commitTimestamps: Array(10).fill(0n),
    answerHashes: Array.from({ length: 10 }, () => new Uint8Array(32)),
    settled: false,
    missedCount: 0,
    forfeit: 0,
    bountyPaid: 0,
    netForfeit: 0,
    eligible: false,
    claimed: false,
    payout: 0,
    bump: 255,
    ...o,
  });
  world.participants.set(alice!.address, participant(alice!));
  world.participants.set(bob!.address, participant(bob!));
  for (const s of [creator!, alice!, bob!, keeper!])
    world.balances.set(s.address, 5_000_000_000n);

  const b64 = getBase64Decoder();
  const rpc: ChainRpc = {
    getProgramAccounts: (_program, config) => ({
      send: async () => {
        const memcmp = (config as { filters: { memcmp: { bytes: string } }[] })
          .filters[0]!.memcmp;
        const want = new Uint8Array(getBase58Encoder().encode(memcmp.bytes));
        const isCohort = want.every(
          (b, i) => b === vault.COHORT_DISCRIMINATOR[i]
        );
        const rows = isCohort
          ? [
              {
                pubkey: cohortPda,
                data: new Uint8Array(
                  vault.getCohortEncoder().encode(world.cohort)
                ),
              },
            ]
          : [...world.participants.entries()].map(([user, p]) => ({
              pubkey: participantPdas.get(user)!,
              data: new Uint8Array(vault.getParticipantEncoder().encode(p)),
            }));
        return rows.map((r) => ({
          pubkey: r.pubkey,
          account: {
            data: [b64.decode(r.data), "base64"] as const,
            lamports: 1_000_000n,
          },
        }));
      },
    }),
    getBalance: (addr) => ({
      send: async () => ({ value: world.balances.get(addr) ?? 0n }),
    }),
  };

  const sent: { signer: TransactionSigner; instructions: Instruction[] }[] = [];
  const hooks: { failWith?: unknown } = {};
  const chain = new SolanaChain({
    rpc,
    now: () => now,
    send: async (signer, instructions) => {
      if (hooks.failWith) throw hooks.failWith;
      sent.push({ signer, instructions });
      return `sig-${sent.length}`;
    },
  });
  for (const s of [creator!, alice!, bob!, keeper!]) chain.registerSigner(s);
  await chain.refresh();
  return {
    chain,
    world,
    sent,
    hooks,
    creator: creator!,
    alice: alice!,
    bob: bob!,
    keeper: keeper!,
    treasury: treasury!,
    cohortPda,
    vaultPda,
    participantPdas,
    participant,
  };
}

const addrs = (ix: Instruction) => (ix.accounts ?? []).map((a) => a.address);

describe("program error mapping", () => {
  it("knows every Anchor error 6002..6021 by the name the UI and generated client use", () => {
    expect(Object.keys(PROGRAM_ERROR_NAMES)).toHaveLength(20);
    for (const [code, name] of Object.entries(PROGRAM_ERROR_NAMES)) {
      expect(vault.getVaultErrorMessage(Number(code) as vault.VaultError)).toBe(
        name
      );
    }
  });

  it("extracts custom codes from the shapes kit and RPCs produce", () => {
    expect(extractCustomErrorCode({ context: { code: 6013 } })).toBe(6013);
    expect(
      extractCustomErrorCode(new Error("failed: custom program error: 0x177d"))
    ).toBe(6013);
    expect(
      extractCustomErrorCode(new Error("custom program error: #6010"))
    ).toBe(6010);
    expect(
      extractCustomErrorCode(
        new Error('{"InstructionError":[1,{"Custom":6011}]}')
      )
    ).toBe(6011);
    expect(
      extractCustomErrorCode({
        message: "outer",
        cause: { context: { code: 6016 } },
      })
    ).toBe(6016);
    expect(extractCustomErrorCode(new Error("network down"))).toBeUndefined();
  });

  it("turns program errors into ChainProgramError and leaves everything else alone", () => {
    const mapped = mapProgramError({ context: { code: 6007 } }, "sig");
    expect(mapped).toBeInstanceOf(ChainProgramError);
    expect((mapped as ChainProgramError).code).toBe("SubmissionWindowClosed");
    const other = new Error("network down");
    expect(mapProgramError(other)).toBe(other);
    const invalidAmount = { context: { code: 6001 } };
    expect(mapProgramError(invalidAmount)).toBe(invalidAmount); // not in the UI vocabulary
  });
});

describe("Ed25519 precompile instruction data", () => {
  it("uses the single-signature inline layout the Rust program parses", () => {
    const pk = new Uint8Array(32).fill(7);
    const sig = new Uint8Array(64).fill(8);
    const msg = new TextEncoder().encode("hello");
    const d = buildEd25519InstructionData(pk, sig, msg);
    const v = new DataView(d.buffer);
    expect([d[0], d[1]]).toEqual([1, 0]);
    expect(v.getUint16(2, true)).toBe(48);
    expect(v.getUint16(4, true)).toBe(0xffff);
    expect(v.getUint16(6, true)).toBe(16);
    expect(v.getUint16(8, true)).toBe(0xffff);
    expect(v.getUint16(10, true)).toBe(112);
    expect(v.getUint16(12, true)).toBe(5);
    expect(v.getUint16(14, true)).toBe(0xffff);
    expect(d).toHaveLength(117);
    expect(() =>
      buildEd25519InstructionData(new Uint8Array(31), sig, msg)
    ).toThrow();
  });
});

describe("cohort ids", () => {
  it("fit the 32-byte PDA seed limit and are slugged", () => {
    const id = makeCohortId(
      "A VERY long title: Rust Ownership & Borrowing Deep Dive!!",
      () => 0.5
    );
    expect(new TextEncoder().encode(id).length).toBeLessThanOrEqual(32);
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(makeCohortId("???", () => 0)).toMatch(/^cohort-/);
  });
});

describe("refresh: on-chain accounts -> UI model", () => {
  it("maps cohort, participants, milestones and vault balance", async () => {
    const t = await setup();
    t.world.participants.set(
      t.alice.address,
      t.participant(t.alice, {
        completedBitmap: 1,
        attemptCounts: Uint8Array.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        commitTimestamps: [BigInt(NOW + 50), ...Array(9).fill(0n)],
        answerHashes: [
          new Uint8Array(32).fill(0xab),
          ...Array.from({ length: 9 }, () => new Uint8Array(32)),
        ],
      })
    );
    await t.chain.refresh();
    const c = t.chain.getCohort(ID)!;
    expect(c).toMatchObject({
      id: ID,
      title: "Rust 101",
      creator: t.creator.address,
      status: "Active",
      stake: STAKE,
      milestoneCount: 2,
      maxParticipants: 5,
      deadlines: [NOW + 120, NOW + 240],
      gracePeriodSeconds: 60,
      clusterId: "devnet",
      programId: vault.VAULT_PROGRAM_ADDRESS,
      startedAt: NOW,
      lastOracleTs: 0,
      totalDeposits: 2n * STAKE,
      vaultBalance: 2n * STAKE, // vault lamports minus the rent reserve
    });
    expect(c.contentHash).toBe("01".repeat(32));
    expect(c.oraclePubkeyHex).toBe(
      bytesToHex(getDemoOracleKeypair().publicKey)
    );
    expect(Object.keys(c.participants).sort()).toEqual(
      [t.alice.address, t.bob.address].sort()
    );

    const a = c.participants[t.alice.address]!;
    expect(a.milestones).toHaveLength(2);
    expect(a.milestones[0]).toMatchObject({
      milestoneIdx: 0,
      answerHash: "ab".repeat(32),
      commitTimestamp: NOW + 50,
      attemptCount: 2,
      completed: true,
    });
    expect(a.milestones[1]).toMatchObject({
      answerHash: "",
      attemptCount: 0,
      completed: false,
    });
    expect(t.chain.getCohorts()).toHaveLength(1);
  });

  it("shows Settling once the last window has closed but nobody has settled yet", async () => {
    const t = await setup(NOW + 240 + 60 + 1);
    expect(t.chain.getCohort(ID)!.status).toBe("Settling");
    const early = await setup(NOW + 240 + 60);
    expect(early.chain.getCohort(ID)!.status).toBe("Active");
  });

  it("builds the finalized economics snapshot from on-chain values (hand-checked)", async () => {
    const t = await setup(NOW + 10_000);
    // alice finished both milestones; bob missed both. forfeit(bob)=0.1 SOL, bounty=0.001 SOL.
    Object.assign(t.world.cohort, {
      status: 3,
      settledCount: 2,
      finalizedAssets: 199_000_000n,
    });
    t.world.participants.set(
      t.alice.address,
      t.participant(t.alice, {
        completedBitmap: 3,
        settled: true,
        eligible: true,
      })
    );
    t.world.participants.set(
      t.bob.address,
      t.participant(t.bob, {
        settled: true,
        missedCount: 2,
        forfeit: STAKE,
        bountyPaid: 1_000_000n,
        netForfeit: 99_000_000n,
      })
    );
    await t.chain.refresh();
    const snap = t.chain.getCohort(ID)!.economicsSnapshot!;
    expect(snap.fee).toBe(1_980_000n);
    expect(snap.pool).toBe(97_020_000n);
    expect(
      snap.participants.find((p) => p.user === t.alice.address)!.payout
    ).toBe(197_020_000n);
    expect(
      snap.participants.find((p) => p.user === t.bob.address)!.payout
    ).toBe(0n);
    expect(snap.invariantHolds).toBe(true);
    expect(snap.dust).toBe(0n);
    expect(t.chain.computeLiveEconomics(ID)).toBe(snap);
  });
});

describe("getMilestoneOutcome mirrors the program (classify_milestones)", () => {
  it("PASSED / COMMITTED / PENDING before the window closes; NEUTRAL vs MISSED after", async () => {
    const after = await setup(NOW + 240 + 60 + 5);
    const commit = (ts: number) => ({
      attemptCounts: Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
      commitTimestamps: [BigInt(ts), BigInt(ts + 100), ...Array(8).fill(0n)],
      answerHashes: Array.from({ length: 10 }, () =>
        new Uint8Array(32).fill(5)
      ),
    });
    // alice: m0 completed, m1 committed on time; oracle last active BEFORE alice's m1 commit => NEUTRAL
    after.world.cohort.lastOracleTs = NOW + 60;
    after.world.participants.set(
      after.alice.address,
      after.participant(after.alice, {
        ...commit(NOW + 50),
        completedBitmap: 1,
      })
    );
    // bob: committed m0 BEFORE the oracle's last activity at NOW+60 (=> MISSED), m1 committed late (=> MISSED)
    after.world.participants.set(
      after.bob.address,
      after.participant(after.bob, {
        attemptCounts: Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
        commitTimestamps: [
          BigInt(NOW + 50),
          BigInt(NOW + 250),
          ...Array(8).fill(0n),
        ],
        answerHashes: Array.from({ length: 10 }, () =>
          new Uint8Array(32).fill(5)
        ),
      })
    );
    await after.chain.refresh();
    const c = after.chain.getCohort(ID)!;
    expect(after.chain.getMilestoneOutcome(c, after.alice.address, 0)).toBe(
      "PASSED"
    );
    expect(after.chain.getMilestoneOutcome(c, after.alice.address, 1)).toBe(
      "NEUTRAL"
    );
    expect(after.chain.getMilestoneOutcome(c, after.bob.address, 0)).toBe(
      "MISSED"
    );
    expect(after.chain.getMilestoneOutcome(c, after.bob.address, 1)).toBe(
      "MISSED"
    );

    const before = await setup(NOW + 10);
    before.world.participants.set(
      before.alice.address,
      before.participant(before.alice, {
        attemptCounts: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        commitTimestamps: [BigInt(NOW + 5), ...Array(9).fill(0n)],
        answerHashes: Array.from({ length: 10 }, () =>
          new Uint8Array(32).fill(5)
        ),
      })
    );
    await before.chain.refresh();
    const bc = before.chain.getCohort(ID)!;
    expect(before.chain.getMilestoneOutcome(bc, before.alice.address, 0)).toBe(
      "COMMITTED"
    );
    expect(before.chain.getMilestoneOutcome(bc, before.alice.address, 1)).toBe(
      "PENDING"
    );
  });
});

describe("transactions", () => {
  it("create_cohort: encodes the intent into the right args and accounts", async () => {
    const t = await setup();
    const res = await t.chain.createCohort(t.creator.address, {
      id: ID,
      title: "Rust 101",
      durationDays: 14,
      milestoneCount: 2,
      stakeSol: 0.1,
      maxParticipants: 5,
      demoFastMode: true,
    });
    expect(res.tx).toMatchObject({
      instruction: "create_cohort",
      status: "SUCCESS",
      signature: "sig-1",
    });
    expect(res.data.id).toBe(ID);

    const ix = t.sent[0]!.instructions[0]!;
    expect(ix.programAddress).toBe(vault.VAULT_PROGRAM_ADDRESS);
    expect(addrs(ix)).toEqual([
      t.creator.address,
      t.cohortPda,
      t.vaultPda,
      "11111111111111111111111111111111",
    ]);
    const args = vault.getCreateCohortInstructionDataDecoder().decode(ix.data!);
    expect(args).toMatchObject({
      id: ID,
      title: "Rust 101",
      stakeLamports: STAKE,
      milestoneCount: 2,
      maxParticipants: 5,
      intervalSeconds: 120n, // demo fast mode: 2 minutes per milestone
      gracePeriodSeconds: 60n,
      treasury: t.creator.address, // default treasury = creator
    });
    expect(bytesToHex(args.oraclePubkey as Uint8Array)).toBe(
      bytesToHex(getDemoOracleKeypair().publicKey)
    );
    expect(bytesToHex(args.contentHash as Uint8Array)).toBe("00".repeat(32));
  });

  it("create_cohort: rejects bad bounds before sending anything", async () => {
    const t = await setup();
    const base = {
      title: "x",
      durationDays: 7,
      milestoneCount: 2,
      stakeSol: 0.1,
      maxParticipants: 5,
    };
    await expect(
      t.chain.createCohort(t.creator.address, { ...base, milestoneCount: 11 })
    ).rejects.toMatchObject({ code: "CohortNotOpen" });
    await expect(
      t.chain.createCohort(t.creator.address, { ...base, maxParticipants: 1 })
    ).rejects.toMatchObject({ code: "CohortNotOpen" });
    await expect(
      t.chain.createCohort(t.creator.address, { ...base, id: "x".repeat(33) })
    ).rejects.toThrow(/32 bytes/);
    expect(t.sent).toHaveLength(0);
  });

  it("join: right accounts; refuses when the wallet cannot cover the stake", async () => {
    const t = await setup();
    await t.chain.join(t.alice.address, ID);
    const ix = t.sent[0]!.instructions[0]!;
    expect(addrs(ix)).toEqual([
      t.alice.address,
      t.cohortPda,
      t.vaultPda,
      t.participantPdas.get(t.alice.address)!,
      "11111111111111111111111111111111",
    ]);
    expect(new Uint8Array(ix.data!)).toEqual(
      new Uint8Array(vault.getJoinInstructionDataEncoder().encode({}))
    );

    t.world.balances.set(t.bob.address, STAKE - 1n);
    await expect(t.chain.join(t.bob.address, ID)).rejects.toMatchObject({
      code: "InsufficientBalance",
    });
    expect(t.sent).toHaveLength(1);
  });

  it("start_cohort: a creator who never joined can still start (participant PDA is passed unchecked)", async () => {
    const t = await setup();
    await t.chain.startCohort(t.creator.address, ID);
    expect(addrs(t.sent[0]!.instructions[0]!)).toEqual([
      t.creator.address,
      t.cohortPda,
      t.participantPdas.get(t.creator.address)!,
    ]);
  });

  it("commit_submission: passes the milestone index and the 32-byte answer hash", async () => {
    const t = await setup();
    const hash = "cd".repeat(32);
    const res = await t.chain.commitSubmission(
      t.alice.address,
      ID,
      1,
      hash,
      "my answer"
    );
    const ix = t.sent[0]!.instructions[0]!;
    expect(addrs(ix)).toEqual([
      t.alice.address,
      t.cohortPda,
      t.participantPdas.get(t.alice.address)!,
    ]);
    const args = vault
      .getCommitSubmissionInstructionDataDecoder()
      .decode(ix.data!);
    expect(args.milestoneIdx).toBe(1);
    expect(bytesToHex(args.answerHash as Uint8Array)).toBe(hash);
    expect(res.tx.instruction).toBe("commit_submission");
  });

  it("complete_milestone: Ed25519 precompile first, signature + message exactly as the program expects", async () => {
    const t = await setup();
    const commitHash = "ab".repeat(32);
    const expiresAt = NOW + 900;
    const oracle = getDemoOracleKeypair();
    const att = signAttestation({
      programId: vault.VAULT_PROGRAM_ADDRESS,
      clusterId: "devnet",
      cohort: ID,
      cohortEpoch: NOW,
      user: t.alice.address,
      milestoneIdx: 0,
      score: 90,
      commitHash,
      expiresAt,
    });

    await t.chain.completeMilestone(t.alice.address, ID, 0, att);
    const [precompile, complete] = t.sent[0]!.instructions;
    expect(t.sent[0]!.instructions).toHaveLength(2);

    expect(precompile!.programAddress).toBe(ED25519_PROGRAM_ADDRESS);
    expect(precompile!.accounts ?? []).toHaveLength(0);
    const d = new Uint8Array(precompile!.data!);
    const sigBytes = d.slice(48, 112);
    const message = d.slice(112);
    // The exact string the Rust build_attestation_payload() produces:
    expect(new TextDecoder().decode(message)).toBe(
      `PAGEPLEDGE_ATT_V1||${vault.VAULT_PROGRAM_ADDRESS}||devnet||${ID}||${NOW}||${t.alice.address}||0||90||${commitHash}||${expiresAt}`
    );
    expect(nacl.sign.detached.verify(message, sigBytes, d.slice(16, 48))).toBe(
      true
    );
    expect(bytesToHex(d.slice(16, 48))).toBe(bytesToHex(oracle.publicKey));

    expect(complete!.programAddress).toBe(vault.VAULT_PROGRAM_ADDRESS);
    expect(addrs(complete!)).toEqual([
      t.alice.address,
      t.cohortPda,
      t.participantPdas.get(t.alice.address)!,
      "Sysvar1nstructions1111111111111111111111111",
    ]);
    const args = vault
      .getCompleteMilestoneInstructionDataDecoder()
      .decode(complete!.data!);
    expect(args).toMatchObject({
      milestoneIdx: 0,
      score: 90,
      expiresAt: BigInt(expiresAt),
    });
    expect(bytesToHex(args.signature as Uint8Array)).toBe(bytesToHex(sigBytes));
  });

  it("settle_user, finalize and claim: accounts include the cohort treasury and target participant", async () => {
    const t = await setup(NOW + 10_000);
    await t.chain.settleUser(t.keeper.address, ID, t.bob.address);
    expect(addrs(t.sent[0]!.instructions[0]!)).toEqual([
      t.keeper.address,
      t.cohortPda,
      t.vaultPda,
      t.participantPdas.get(t.bob.address)!,
      "11111111111111111111111111111111",
    ]);

    await t.chain.finalize(t.keeper.address, ID);
    expect(addrs(t.sent[1]!.instructions[0]!)).toEqual([
      t.keeper.address,
      t.cohortPda,
      t.vaultPda,
      t.treasury.address,
      "11111111111111111111111111111111",
    ]);

    await t.chain.claim(t.alice.address, ID);
    expect(addrs(t.sent[2]!.instructions[0]!)).toEqual([
      t.alice.address,
      t.cohortPda,
      t.vaultPda,
      t.participantPdas.get(t.alice.address)!,
      t.treasury.address,
      "11111111111111111111111111111111",
    ]);
  });

  it("turns program failures into typed errors and records them in the log", async () => {
    const t = await setup();
    t.hooks.failWith = new Error("simulation failed", {
      cause: { context: { code: 6013 } },
    });
    const att = signAttestation({
      programId: vault.VAULT_PROGRAM_ADDRESS,
      clusterId: "devnet",
      cohort: ID,
      cohortEpoch: NOW,
      user: t.alice.address,
      milestoneIdx: 0,
      score: 90,
      commitHash: "ab".repeat(32),
      expiresAt: NOW + 900,
    });
    await expect(
      t.chain.completeMilestone(t.alice.address, ID, 0, att)
    ).rejects.toMatchObject({
      name: "ChainProgramError",
      code: "BadSignature",
    });
    const log = t.chain.getTransactions(ID);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      status: "ERROR",
      errorCode: "BadSignature",
      instruction: "complete_milestone",
    });

    t.hooks.failWith = new Error("network down");
    await expect(t.chain.claim(t.alice.address, ID)).rejects.toThrow(
      "network down"
    );
  });

  it("needs a registered wallet for the acting address, and knows when a cohort does not exist", async () => {
    const t = await setup();
    const stranger = await generateKeyPairSigner();
    await expect(t.chain.join(stranger.address, ID)).rejects.toThrow(
      /No wallet signer registered/
    );
    await expect(t.chain.join(t.alice.address, "nope")).rejects.toMatchObject({
      code: "WrongCohort",
    });
    expect(t.sent).toHaveLength(0);
  });

  it("exposes registered wallets as personas with live balances", async () => {
    const t = await setup();
    expect(t.chain.getPersonas()).toHaveLength(4);
    expect(t.chain.getPersona(t.alice.address)!.lamportsBalance).toBe(
      5_000_000_000n
    );
    expect(hexToBytes("00ff")).toEqual(Uint8Array.from([0, 255]));
  });
});
