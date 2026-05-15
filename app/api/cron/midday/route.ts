import { authorize } from "@/lib/auth";
import { runFullPipeline } from "@/lib/pipeline";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const result = await runFullPipeline({
    runType: "midday",
    minConvictionToPost: "high",
  });

  return NextResponse.json(
    {
      ok: result.ok,
      run_id: result.runId,
      generated: result.recommendations.length,
      posted: result.discord?.ok ? (result.discord as { posted: number }).posted : 0,
      cost_cents: result.costCents,
      duration_ms: result.durationMs,
      ...(result.error ? { error: result.error } : {}),
    },
    { status: result.ok ? 200 : 500 }
  );
}
