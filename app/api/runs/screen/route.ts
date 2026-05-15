import { authorize } from "@/lib/auth";
import { runScreener } from "@/lib/screener";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds — web search can be slow

export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const result = await runScreener();
    return NextResponse.json({
      ok: true,
      flagged: result.flagged,
      cost_cents: result.costCents,
      duration_ms: result.durationMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
