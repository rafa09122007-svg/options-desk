import { authorize } from "@/lib/auth";
import { runScreener } from "@/lib/screener";
import { runAnalyst } from "@/lib/analyst";
import { postRecsToDiscord } from "@/lib/discord";
import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import type { RunType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — full pipeline can be long

export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const runType = (req.nextUrl.searchParams.get("run_type") ?? "morning_brief") as RunType;
  const startedAt = Date.now();

  // Create the run row up front so we can update status
  const { data: run, error: runErr } = await supabaseAdmin
    .from("daily_runs")
    .insert({
      run_date: new Date().toISOString().slice(0, 10),
      run_type: runType,
      status: "running",
    })
    .select()
    .single();

  if (runErr || !run) {
    return NextResponse.json(
      { ok: false, error: `Failed to create run row: ${runErr?.message}` },
      { status: 500 }
    );
  }

  try {
    // 1) SCREEN
    const screened = await runScreener();
    let totalCostCents = screened.costCents;

    if (screened.flagged.length === 0) {
      await supabaseAdmin
        .from("daily_runs")
        .update({
          tickers_screened: 0,
          recommendations_generated: 0,
          total_cost_cents: totalCostCents,
          duration_ms: Date.now() - startedAt,
          status: "success",
        })
        .eq("id", run.id);

      return NextResponse.json({
        ok: true,
        run_id: run.id,
        flagged: [],
        recommendations: [],
        no_trades_reason: "Screener found nothing interesting today.",
        cost_cents: totalCostCents,
        duration_ms: Date.now() - startedAt,
      });
    }

    // 2) ANALYZE each flagged ticker
    const recommendations = [];
    const skipped = [];

    for (const flag of screened.flagged) {
      const result = await runAnalyst(flag.ticker, {
        direction_hint: flag.direction_hint,
        reason: flag.reason,
      });
      totalCostCents += result.costCents;

      if (result.kind === "trade") {
        recommendations.push(result.recommendation);
      } else {
        skipped.push({ ticker: flag.ticker, reason: result.reason });
      }
    }

    // 3) Finalize run
    await supabaseAdmin
      .from("daily_runs")
      .update({
        tickers_screened: screened.flagged.length,
        recommendations_generated: recommendations.length,
        total_cost_cents: totalCostCents,
        duration_ms: Date.now() - startedAt,
        status: "success",
      })
      .eq("id", run.id);

    // 4) POST TO DISCORD — only high+ conviction by default
    const minConv = (req.nextUrl.searchParams.get("post_min") ?? "high");
    const CONV_RANK: Record<string, number> = {
      low: 0, medium: 1, high: 2, best_idea: 3,
    };
    const minRank = CONV_RANK[minConv] ?? 2;
    const toPost = recommendations.filter(
      (r) => CONV_RANK[r.conviction] >= minRank
    );
    const discord = await postRecsToDiscord(toPost);

    return NextResponse.json({
      ok: true,
      run_id: run.id,
      flagged: screened.flagged,
      recommendations,
      skipped,
      discord,
      cost_cents: totalCostCents,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("daily_runs")
      .update({
        status: "failed",
        error_message: msg,
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", run.id);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
