import { NextResponse } from "next/server";
import { z } from "zod";
import { getMilestoneMaterial } from "@/lib/oracle/passages";

const QuestionRequestSchema = z
  .object({
    milestoneIdx: z.number().int().min(0).max(99).default(0),
    variantIdx: z.number().int().min(0).max(10).optional(),
    weakTopic: z.string().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = QuestionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid question request payload",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { milestoneIdx, variantIdx = 0, weakTopic } = parsed.data;
    const material = getMilestoneMaterial(milestoneIdx);
    const question = material.questions[variantIdx % material.questions.length];
    const practiceDrill = weakTopic
      ? (material.practiceDrills[weakTopic] ??
        Object.values(material.practiceDrills)[0])
      : Object.values(material.practiceDrills)[0];

    return NextResponse.json({
      milestoneIdx: material.milestoneIdx,
      title: material.title,
      subtitle: material.subtitle,
      passage: material.passage,
      contentHash: material.contentHash,
      question,
      questions: material.questions,
      rubricVersion: material.rubricVersion,
      rubric: material.rubric.map((r) => ({
        id: r.id,
        topic: r.topic,
        description: r.description,
        weight: r.weight,
      })),
      exemplarHint: material.exemplarAnswer,
      practiceDrill,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load milestone question",
      },
      { status: 500 }
    );
  }
}
