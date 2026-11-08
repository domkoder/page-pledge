import { z } from "zod";
import { getDemoOracleKeypair, hashAnswerText } from "../chain/attestation";
import {
  PROTOCOL_FEE_BPS,
  computeForfeit,
  formatSol,
  parseSolToLamports,
} from "../economics";
import { MILESTONE_MATERIALS } from "../oracle/passages";

/**
 * Exact `.strict()` Zod schema required by ADR 0010 & ADR 0012:
 * title, durationDays (1-90), milestoneCount (2-10), stakeSol (0.05-10), maxParticipants (2-50)
 */
export const CohortIntentSchema = z
  .object({
    title: z.string().min(3, "Title must be at least 3 characters").max(100),
    durationDays: z
      .number()
      .int()
      .min(1, "Duration must be 1–90 days")
      .max(90, "Duration must be 1–90 days"),
    milestoneCount: z
      .number()
      .int()
      .min(2, "Milestones must be between 2 and 10")
      .max(10, "Milestones must be between 2 and 10"),
    stakeSol: z
      .number()
      .min(0.05, "Stake must be between 0.05 and 10 SOL")
      .max(10, "Stake must be between 0.05 and 10 SOL"),
    maxParticipants: z
      .number()
      .int()
      .min(2, "Max participants must be between 2 and 50")
      .max(50, "Max participants must be between 2 and 50"),
  })
  .strict();

export type ParsedCohortIntent = z.infer<typeof CohortIntentSchema>;

export interface IntentTermsPreview {
  intent: ParsedCohortIntent;
  stakeLamports: bigint;
  stakeFormatted: string;
  forfeitPerMissFormatted: string;
  forfeitPerMissFraction: string;
  protocolFeeFormatted: string;
  oraclePubkeyHex: string;
  contentHash: string;
  isCustomMaterial?: boolean;
  gracePeriodFormatted: string;
  deadlinesPreview: string[];
  validationBadges: { label: string; valid: boolean }[];
}

export interface IntentParseResult {
  ok: boolean;
  intent?: ParsedCohortIntent;
  terms?: IntentTermsPreview;
  parserMode: "heuristic" | "llm";
  error?: string;
  unsupportedReason?: string;
}

export interface ExampleIntentChip {
  id: string;
  label: string;
  prompt: string;
  isUnsupportedDemo?: boolean;
}

export const EXAMPLE_INTENT_CHIPS: ExampleIntentChip[] = [
  {
    id: "rust-5m",
    label: "Rust Ownership (5 milestones, 0.5 SOL)",
    prompt:
      "Create a 14-day Rust Ownership & Borrowing study cohort with 5 milestones, 0.5 SOL stake, and up to 12 participants.",
  },
  {
    id: "fast-sprint",
    label: "Weekend Borrow Checker Sprint (3 milestones, 0.1 SOL)",
    prompt:
      "Run a 3-day Weekend Borrow Checker Sprint over 3 milestones with 0.1 SOL stake for 6 participants.",
  },
  {
    id: "deep-dive",
    label: "Systems Programming Mastery (4 milestones, 1.0 SOL)",
    prompt:
      "Launch a 28-day Systems Programming Mastery cohort with 4 milestones, 1.0 SOL stake, max 20 participants.",
  },
  {
    id: "unsupported-leverage",
    label: "Reject Demo: 100x Leverage & Custom Creator Fee",
    prompt:
      "Create a 10-day cohort with 100x leverage, 0% protocol fee, and 50% creator payout cut from forfeits.",
    isUnsupportedDemo: true,
  },
];

const UNSUPPORTED_FEATURE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(\d+x\s*leverage|leverage|margin|perp|shorting)\b/i,
    reason:
      "Unsupported feature requested: Leverage / margin trading is prohibited. PagePledge vaults hold 1:1 principal in Native SOL lamports.",
  },
  {
    pattern:
      /\b(custom\s+fee|0%\s*(protocol\s*)?fee|zero\s+fee|change\s+fee|fee\s+to\s+\d+%)/i,
    reason:
      "Unsupported parameter: Protocol fee is fixed by the protocol at 200 bps (2.00%) of net forfeits and is not user-settable.",
  },
  {
    pattern:
      /\b(creator\s+(payout|cut|fee|rake|commission|share)|host\s+(cut|fee|payout))\b/i,
    reason:
      "Unsupported parameter: Creator payouts/cuts are disallowed. Net forfeits (after 1% settle bounty and 2% protocol fee) go strictly to eligible finishers.",
  },
  {
    pattern:
      /\b(admin\s+slash|manual\s+slash|oracle\s+slash|creator\s+slash)\b/i,
    reason:
      "Unsupported rule: Neither the AI oracle nor the creator can slash users. Forfeitures are computed deterministically by the program after deadline + grace.",
  },
];

export function detectUnsupportedIntent(prompt: string): string | null {
  for (const rule of UNSUPPORTED_FEATURE_PATTERNS) {
    if (rule.pattern.test(prompt)) {
      return rule.reason;
    }
  }
  return null;
}

/**
 * Deterministic heuristic parser for natural-language cohort descriptions.
 */
export function parseIntentHeuristically(
  prompt: string,
  customMaterialText?: string,
  demoFastMode: boolean = false
): IntentParseResult {
  const trimmed = prompt.trim();
  if (trimmed.length < 5) {
    return {
      ok: false,
      parserMode: "heuristic",
      error:
        "Please enter a descriptive sentence for the cohort you want to create.",
    };
  }

  const unsupported = detectUnsupportedIntent(trimmed);
  if (unsupported) {
    return {
      ok: false,
      parserMode: "heuristic",
      error: unsupported,
      unsupportedReason: unsupported,
    };
  }

  // Extract durationDays (e.g., "14-day", "14 days", "2 weeks", "3-week")
  let durationDays = 14;
  const dayMatch = trimmed.match(/(\d+)\s*-?\s*days?\b/i);
  const weekMatch = trimmed.match(/(\d+)\s*-?\s*weeks?\b/i);
  if (dayMatch) {
    durationDays = parseInt(dayMatch[1], 10);
  } else if (weekMatch) {
    durationDays = parseInt(weekMatch[1], 10) * 7;
  }

  // Extract milestoneCount (e.g. "5 milestones", "3-milestone", "4 chapters")
  let milestoneCount = 3;
  const milestoneMatch = trimmed.match(
    /(\d+)\s*-?\s*(?:milestones?|chapters?|modules?|checks?)\b/i
  );
  if (milestoneMatch) {
    milestoneCount = parseInt(milestoneMatch[1], 10);
  }

  // Extract stakeSol (e.g. "0.5 SOL", "1.0 SOL stake", "stake of 0.1 SOL")
  let stakeSol = 0.5;
  const solMatch =
    trimmed.match(/(\d+(?:\.\d+)?)\s*SOL\b/i) ??
    trimmed.match(/stake\s+(?:of\s+)?(\d+(?:\.\d+)?)/i);
  if (solMatch) {
    stakeSol = Number(parseFloat(solMatch[1]).toFixed(4));
  }

  // Extract maxParticipants (e.g. "12 participants", "max 20", "up to 10 people/students/peers")
  let maxParticipants = 10;
  const partMatch =
    trimmed.match(
      /(\d+)\s*(?:participants?|students?|peers?|members?|people|users?)\b/i
    ) ?? trimmed.match(/(?:max|up\s+to)\s+(\d+)\b/i);
  if (partMatch) {
    maxParticipants = parseInt(partMatch[1], 10);
  }

  // Extract or synthesize a clean title
  let title = "Rust Ownership & Borrowing Cohort";
  const quotedTitle = trimmed.match(/"([^"]{3,80})"/);
  if (quotedTitle) {
    title = quotedTitle[1].trim();
  } else {
    // Look for a phrase after "Create/Run/Launch a [N-day]" and before "with/over/for"
    const phraseMatch = trimmed.match(
      /(?:create|run|launch|start|build)?\s*(?:a|an)?\s*(?:\d+\s*-?\s*(?:day|week)s?\s+)?([A-Za-z0-9 &:'/-]{4,65}?)(?:\s+(?:with|over|for|at|staking|\d+\s*milestones?|$))/i
    );
    if (phraseMatch && phraseMatch[1].trim().length >= 4) {
      const candidate = phraseMatch[1].trim().replace(/\s+/g, " ");
      title = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  const parsed = CohortIntentSchema.safeParse({
    title,
    durationDays,
    milestoneCount,
    stakeSol,
    maxParticipants,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      parserMode: "heuristic",
      error: `Validation error (${firstIssue.path.join(".")}): ${firstIssue.message}`,
    };
  }

  return {
    ok: true,
    parserMode: "heuristic",
    intent: parsed.data,
    terms: buildTermsPreview(parsed.data, demoFastMode, customMaterialText),
  };
}

export function buildTermsPreview(
  intent: ParsedCohortIntent,
  demoFastMode: boolean = false,
  customMaterialText?: string
): IntentTermsPreview {
  const stakeLamports = parseSolToLamports(intent.stakeSol);
  const forfeitPerMiss = computeForfeit(
    stakeLamports,
    1,
    intent.milestoneCount
  );
  const oraclePubkeyHex = getDemoOracleKeypair().publicKeyHex;
  const trimmedCustom = customMaterialText?.trim();
  const isCustomMaterial = Boolean(trimmedCustom && trimmedCustom.length > 0);
  const contentHash = isCustomMaterial
    ? hashAnswerText(trimmedCustom!)
    : MILESTONE_MATERIALS[0].contentHash;

  const deadlinesPreview = Array.from(
    { length: intent.milestoneCount },
    (_, idx) => {
      if (demoFastMode) {
        return `M${idx + 1}: +${(idx + 1) * 2} min`;
      }
      const dayOffset = Math.max(
        1,
        Math.round(((idx + 1) * intent.durationDays) / intent.milestoneCount)
      );
      return `M${idx + 1}: Day ${dayOffset}`;
    }
  );

  return {
    intent,
    stakeLamports,
    stakeFormatted: `${formatSol(stakeLamports)} (${stakeLamports.toLocaleString()} lamports)`,
    forfeitPerMissFormatted: formatSol(forfeitPerMiss),
    forfeitPerMissFraction: `1/${intent.milestoneCount} of stake (${formatSol(forfeitPerMiss)})`,
    protocolFeeFormatted: `${Number(PROTOCOL_FEE_BPS) / 100}% (${PROTOCOL_FEE_BPS} bps of net forfeits, fixed)`,
    oraclePubkeyHex,
    contentHash,
    isCustomMaterial,
    gracePeriodFormatted: demoFastMode
      ? "1 minute (Demo Fast Mode)"
      : "24 hours (86,400s)",
    deadlinesPreview,
    validationBadges: [
      { label: "Strict Zod Schema Validated", valid: true },
      {
        label: `Stake Bounds (0.05–10 SOL): ${intent.stakeSol} SOL (${stakeLamports.toLocaleString()} lamports)`,
        valid: true,
      },
      { label: `Milestones (2–10): ${intent.milestoneCount}`, valid: true },
      {
        label: `Participants (2–50): max ${intent.maxParticipants}`,
        valid: true,
      },
      { label: "Fixed 200 bps Fee (No Custom/Creator Cut)", valid: true },
    ],
  };
}

export async function parseCohortIntent(
  prompt: string,
  demoFastMode: boolean = false,
  customMaterialText?: string
): Promise<IntentParseResult> {
  // Always enforce unsupported feature rejection before calling any LLM
  const unsupported = detectUnsupportedIntent(prompt);
  if (unsupported) {
    return {
      ok: false,
      parserMode: "heuristic",
      error: unsupported,
      unsupportedReason: unsupported,
    };
  }

  const apiKey =
    typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined;
  if (apiKey) {
    try {
      const systemInstruction = [
        "Extract cohort parameters from the user prompt into JSON with ONLY these 5 keys:",
        "title (string), durationDays (int 1..90), milestoneCount (int 2..10), stakeSol (number 0.05..10), maxParticipants (int 2..50).",
        "Never output Solana instructions, accounts, or extra keys.",
      ].join(" ");

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [
              { role: "user", parts: [{ text: prompt.slice(0, 500) }] },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0,
            },
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const validated = CohortIntentSchema.safeParse(JSON.parse(rawJson));
          if (validated.success) {
            return {
              ok: true,
              parserMode: "llm",
              intent: validated.data,
              terms: buildTermsPreview(
                validated.data,
                demoFastMode,
                customMaterialText
              ),
            };
          }
        }
      }
    } catch {
      // Fall back to deterministic heuristic parser
    }
  }

  return parseIntentHeuristically(prompt, customMaterialText, demoFastMode);
}
