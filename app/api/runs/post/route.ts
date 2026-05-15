import { authorize } from "@/lib/auth";
import { postRecsToDiscord } from "@/lib/discord";
import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import type { Conviction, Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";

const CONVICTION_RANK: Record<Conviction, number> = {
  low: 0,
  medium: 1,
  high: 2,
  best_idea: 3,
};

export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  // ?min_conviction=high (default) | medium | low | best_idea
  const minConviction = (req.nextUrl.searchParams.get("min_conviction") ??
    "high") as Conviction;
  const minRank = CONVICTION_RANK[minConviction] ?? CONVICTION_RANK.high;

  // ?days=1 (default) — how far back to look for unposted recs
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "1", 10);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // ?force=1 — re-post even already-posted recs
  const force = req.nextUrl.searchParams.get("force") === "1";

  let query = supabaseAdmin
    .from("recommendations")
    .select("*")
    .eq("status", "open")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (!force) query = query.eq("posted_to_discord", false);

  const { data, error } = await query.returns<Recommendation[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filtered = (data ?? []).filter(
    (r) => CONVICTION_RANK[r.conviction] >= minRank
  );

  const result = await postRecsToDiscord(filtered, { quietPostWhenEmpty: false });
  return NextResponse.json({
    ...result,
    considered: data?.length ?? 0,
    sent: filtered.length,
    min_conviction: minConviction,
  });
}
