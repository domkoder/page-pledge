import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseCohortIntent } from '@/lib/intent/parser';

const IntentRequestSchema = z
  .object({
    prompt: z.string().min(1).max(1000),
    demoFastMode: z.boolean().optional(),
    customMaterialText: z.string().max(10_000).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = IntentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await parseCohortIntent(
      parsed.data.prompt,
      parsed.data.demoFastMode ?? false,
      parsed.data.customMaterialText
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json(
      JSON.parse(
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      )
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to parse cohort intent',
      },
      { status: 500 }
    );
  }
}
