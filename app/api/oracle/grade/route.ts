import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOracleRateLimit, evaluateSubmission } from "@/lib/oracle/grader";

const GradeRequestSchema = z
  .object({
    cohortId: z.string().min(1),
    cohortEpoch: z.number().int(),
    programId: z.string().optional(),
    clusterId: z.string().optional(),
    user: z.string().min(1),
    milestoneIdx: z.number().int().min(0).max(99),
    answerText: z.string().min(1).max(5000),
    commitHash: z.string().optional(),
    now: z.number().int().optional(),
    isPractice: z.boolean().optional(),
    practiceTopic: z.string().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = GradeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid grade request payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const req = parsed.data;

    // Rate-limit grading attempts per (cohortId, user, milestoneIdx) unless it is an off-chain practice drill
    if (!req.isPractice) {
      const rateLimit = checkOracleRateLimit(
        req.cohortId,
        req.user,
        req.milestoneIdx
      );
      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            error: `Rate limit exceeded for ${req.user} on milestone ${req.milestoneIdx + 1} (${rateLimit.attemptsUsed}/${rateLimit.maxAttempts} attempts in rolling window).`,
            code: "RateLimitExceeded",
          },
          { status: 429 }
        );
      }

      const result = await evaluateSubmission(req);
      return NextResponse.json({
        ...result,
        attemptsUsed: rateLimit.attemptsUsed,
        maxAttemptsPerWindow: rateLimit.maxAttempts,
      });
    }

    const practiceResult = await evaluateSubmission(req);
    return NextResponse.json(practiceResult);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Oracle grading error" },
      { status: 500 }
    );
  }
}
