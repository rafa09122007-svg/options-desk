import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1) Supabase connection
  try {
    const { count, error } = await supabaseAdmin
      .from("watchlist")
      .select("*", { count: "exact", head: true });
    checks.supabase = error
      ? { ok: false, detail: error.message }
      : { ok: true, detail: `${count ?? 0} tickers in watchlist` };
  } catch (e) {
    checks.supabase = { ok: false, detail: (e as Error).message };
  }

  // 2) Anthropic API key present (don't actually call the API here — costs money)
  checks.anthropic = {
    ok: Boolean(process.env.ANTHROPIC_API_KEY),
    detail: process.env.ANTHROPIC_API_KEY ? "API key set" : "missing",
  };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
