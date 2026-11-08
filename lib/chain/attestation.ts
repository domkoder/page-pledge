import nacl from "tweetnacl";
import { ChainProgramError, OracleAttestation } from "./types";

export const ATTESTATION_DOMAIN = "PAGEPLEDGE_ATT_V1";
export const MIN_PASSING_SCORE = 75;

/**
 * Deterministic demo Oracle Ed25519 keypair derived from a fixed 32-byte seed
 * so offline mode, server routes, and browser MockChain share a consistent default oracle pubkey.
 */
const DEFAULT_ORACLE_SEED = new Uint8Array([
  0x50, 0x41, 0x47, 0x45, 0x50, 0x4c, 0x45, 0x44, 0x47, 0x45, 0x5f, 0x4f, 0x52,
  0x41, 0x43, 0x4c, 0x45, 0x5f, 0x44, 0x45, 0x4d, 0x4f, 0x5f, 0x53, 0x45, 0x45,
  0x44, 0x5f, 0x32, 0x30, 0x32, 0x36,
]);

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`Invalid hex string: "${hex}"`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function getDemoOracleKeypair(): {
  publicKeyHex: string;
  secretKeyHex: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  const envSeedHex =
    typeof process !== "undefined"
      ? process.env?.ORACLE_SECRET_SEED_HEX
      : undefined;
  const seed =
    envSeedHex && envSeedHex.length === 64
      ? hexToBytes(envSeedHex)
      : DEFAULT_ORACLE_SEED;
  const kp = nacl.sign.keyPair.fromSeed(seed);
  return {
    publicKeyHex: bytesToHex(kp.publicKey),
    secretKeyHex: bytesToHex(kp.secretKey),
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
}

export interface CanonicalAttestationFields {
  programId: string;
  clusterId: string;
  cohort: string;
  cohortEpoch: number;
  user: string;
  milestoneIdx: number;
  score: number;
  commitHash: string;
  expiresAt: number;
}

/**
 * Builds the canonical, domain-separated byte payload (Section 3 of p1.md):
 * "PAGEPLEDGE_ATT_V1" || programId || clusterId || cohort || cohortEpoch || user || milestoneIdx || score || commitHash || expiresAt
 *
 * Uses length-prefixed UTF-8 / big-endian integer encoding so field boundaries can never collide.
 */
export function buildAttestationPayload(
  fields: CanonicalAttestationFields
): Uint8Array {
  const canonicalString = [
    ATTESTATION_DOMAIN,
    fields.programId,
    fields.clusterId,
    fields.cohort,
    String(fields.cohortEpoch),
    fields.user,
    String(fields.milestoneIdx),
    String(fields.score),
    fields.commitHash,
    String(fields.expiresAt),
  ].join("||");

  return new TextEncoder().encode(canonicalString);
}

/**
 * Signs a canonical attestation payload using an Ed25519 secret key (64 bytes).
 */
export function signAttestation(
  fields: CanonicalAttestationFields,
  secretKey: Uint8Array = getDemoOracleKeypair().secretKey
): OracleAttestation {
  const payload = buildAttestationPayload(fields);
  const sig = nacl.sign.detached(payload, secretKey);
  const pubKey = secretKey.slice(32, 64);

  return {
    cohortId: fields.cohort,
    cohortEpoch: fields.cohortEpoch,
    user: fields.user,
    milestoneIdx: fields.milestoneIdx,
    score: fields.score,
    commitHash: fields.commitHash,
    expiresAt: fields.expiresAt,
    signatureHex: bytesToHex(sig),
    oraclePubkeyHex: bytesToHex(pubKey),
  };
}

export interface VerifyAttestationContext {
  expectedProgramId: string;
  expectedClusterId: string;
  expectedCohortId: string;
  expectedCohortEpoch: number;
  expectedUser: string;
  expectedMilestoneIdx: number;
  expectedCommitHash: string;
  oraclePubkeyHex: string;
  now: number;
}

/**
 * Rebuilds the canonical attestation payload from MockChain's own state and verifies
 * the Ed25519 signature against the cohort's configured oracle public key.
 * Never trusts a payload from the client.
 *
 * Throws a ChainProgramError with the exact error code if any check fails.
 */
export function verifyAttestation(
  attestation: OracleAttestation,
  ctx: VerifyAttestationContext
): void {
  // 1. Check cohort match
  if (
    attestation.cohortId !== ctx.expectedCohortId ||
    attestation.cohortEpoch !== ctx.expectedCohortEpoch
  ) {
    throw new ChainProgramError(
      "WrongCohort",
      `Attestation cohort (${attestation.cohortId}@${attestation.cohortEpoch}) does not match (${ctx.expectedCohortId}@${ctx.expectedCohortEpoch}).`
    );
  }

  // 2. Check user match
  if (attestation.user !== ctx.expectedUser) {
    throw new ChainProgramError(
      "WrongUser",
      `Attestation user (${attestation.user}) does not match caller/participant (${ctx.expectedUser}).`
    );
  }

  // 3. Check expiry against simulated chain clock
  if (ctx.now > attestation.expiresAt) {
    throw new ChainProgramError(
      "AttestationExpired",
      `Attestation expired at ${attestation.expiresAt} (current chain time: ${ctx.now}).`
    );
  }

  // 4. Check passing score threshold (>= 75)
  if (attestation.score < MIN_PASSING_SCORE) {
    throw new ChainProgramError(
      "ScoreTooLow",
      `Attestation score ${attestation.score} is below minimum passing threshold (${MIN_PASSING_SCORE}).`
    );
  }

  // 5. Rebuild canonical byte payload strictly from chain state + attested score/expiresAt
  // Note: expectedCommitHash comes from the participant's latest on-chain commit!
  // If the client tampered with score, expiresAt, user, cohort, or commitHash, the signature verification below will fail with BadSignature.
  const rebuiltPayload = buildAttestationPayload({
    programId: ctx.expectedProgramId,
    clusterId: ctx.expectedClusterId,
    cohort: ctx.expectedCohortId,
    cohortEpoch: ctx.expectedCohortEpoch,
    user: ctx.expectedUser,
    milestoneIdx: ctx.expectedMilestoneIdx,
    score: attestation.score,
    commitHash: ctx.expectedCommitHash,
    expiresAt: attestation.expiresAt,
  });

  let sigBytes: Uint8Array;
  let pubkeyBytes: Uint8Array;
  try {
    sigBytes = hexToBytes(attestation.signatureHex);
    pubkeyBytes = hexToBytes(ctx.oraclePubkeyHex);
  } catch {
    throw new ChainProgramError(
      "BadSignature",
      "Malformed hex in signature or oracle public key."
    );
  }

  if (
    sigBytes.length !== nacl.sign.signatureLength ||
    pubkeyBytes.length !== nacl.sign.publicKeyLength
  ) {
    throw new ChainProgramError(
      "BadSignature",
      "Invalid signature or public key byte length."
    );
  }

  const isValid = nacl.sign.detached.verify(
    rebuiltPayload,
    sigBytes,
    pubkeyBytes
  );
  if (!isValid) {
    throw new ChainProgramError(
      "BadSignature",
      "Ed25519 signature verification failed against cohort oracle public key and on-chain commit state."
    );
  }
}

/**
 * Deterministic SHA-256-like commitment hash helper (works synchronously in browser & Node).
 */
export function hashAnswerText(answerText: string): string {
  const bytes = new TextEncoder().encode(
    `PAGEPLEDGE_COMMIT_V1:${answerText.trim()}`
  );
  const digest = nacl.hash(bytes); // SHA-512 in tweetnacl, take first 32 bytes (64 hex chars)
  return bytesToHex(digest.slice(0, 32));
}
