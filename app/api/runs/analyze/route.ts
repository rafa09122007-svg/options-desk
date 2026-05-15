import { authorize } from "@/lib/auth";
import { runAnalyst } from "@/lib/analyst";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json(
      { error: "Pass ?ticker=XXX (and ?key=YOUR_SECRET)" },
      { status: 400 }
    );
  }

  try {
    const result = await runAnalyst(ticker);
    if (result.kind === "no_trade") {
      return NextResponse.json({
        ok: true,
        kind: "no_trade",
        ticker,
        reason: result.reason,
        cost_cents: result.costCents,
      });
    }
    return NextResponse.json({
      ok: true,
      kind: "trade",
      recommendation: result.recommendation,
      cost_cents: result.costCents,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
