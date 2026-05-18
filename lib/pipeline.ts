import { postRecsToDiscord, type PostResult } from "./discord";
import { runAnalyst } from "./analyst";
import { runScreener, type ScreenerFlag } from "./screener";
import { getAccountSettings } from "./settings";
import { supabaseAdmin } from "./supabase";
import type { Conviction, Recommendation, RunType } from "./types";

const CONV_RANK: Record<Conviction, number> = {
  low: 0, medium: 1, high: 2, best_idea: 3,
};

export type PipelineResult = {
  ok: boolean;
  runId: number;
  flagged: ScreenerFlag[];
  recommendations: Recommendation[];
  skipped: Array<{ ticker: string; reason: string }>;
  discord: PostResult | null;
  costCents: number;
  durationMs: number;
  error?: string;
};

/**
 * Runs the full pipeline:
 *   1. Screen the watchlist with Haiku
 *   2. For each flagged ticker, run the Opus analyst
 *   3. Save recommendations + log the run
 *   4. Post qualifying recs to Discord
 */
export async function runFullPipeline(opts: {
  runType: RunType;
  minConvictionToPost?: Conviction; // default "high"
}): Promise<PipelineResult> {
  const startedAt = Date.now();
  const minRank = CONV_RANK[opts.minConvictionToPost ?? "high"];

  // Create the run row so we can track status
  const { data: run, error: runErr } = await supabaseAdmin
    .from("daily_runs")
    .insert({
      run_date: new Date().toISOString().slice(0, 10),
      run_type: opts.runType,
      status: "running",
    })
    .select()
    .single();

  if (runErr || !run) {
    return {
      ok: false,
      runId: -1,
      flagged: [],
      recommendations: [],
      skipped: [],
      discord: null,
      costCents: 0,
      durationMs: Date.now() - startedAt,
      error: `Failed to create run row: ${runErr?.message}`,
    };
  }

  try {
    // Load account settings (for forced tickers like daily SPY 0DTE)
    const settings = await getAccountSettings();

    // 1) Screen
    const screened = await runScreener();
    let costCents = screened.costCents;

    // 1b) FORCE-INCLUDE SPY if 0DTE is enabled — guarantees a daily same-day eval
    //     even when the screener doesn't flag it.
    if (
      settings.enable_0dte_spy &&
      !screened.flagged.some((f) => f.ticker.toUpperCase() === "SPY")
    ) {
      screened.flagged.unshift({
        ticker: "SPY",
        interest_score: 55,
        direction_hint: "neutral",
        reason:
          "Daily 0DTE evaluation required — analyze intraday structure for ORB/VWAP/key-level setups regardless of screener output",
      });
    }

    // No flags AND SPY force-include didn't apply — quiet day
    if (screened.flagged.length === 0) {
      await supabaseAdmin
        .from("daily_runs")
        .update({
          tickers_screened: 0,
          recommendations_generated: 0,
          total_cost_cents: costCents,
          duration_ms: Date.now() - startedAt,
          status: "success",
        })
        .eq("id", run.id);

      return {
        ok: true,
        runId: run.id,
        flagged: [],
        recommendations: [],
        skipped: [],
        discord: null,
        costCents,
        durationMs: Date.now() - startedAt,
      };
    }

    // 2) Analyze each flagged ticker
    const recommendations: Recommendation[] = [];
    const skipped: Array<{ ticker: string; reason: string }> = [];

    for (const flag of screened.flagged) {
      const result = await runAnalyst(flag.ticker, {
        direction_hint: flag.direction_hint,
        reason: flag.reason,
      });
      costCents += result.costCents;

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
        total_cost_cents: costCents,
        duration_ms: Date.now() - startedAt,
        status: "success",
      })
      .eq("id", run.id);

    // 4) Post to Discord
    const toPost = recommendations.filter(
      (r) => CONV_RANK[r.conviction] >= minRank
    );
    const discord = await postRecsToDiscord(toPost);

    return {
      ok: true,
      runId: run.id,
      flagged: screened.flagged,
      recommendations,
      skipped,
      discord,
      costCents,
      durationMs: Date.now() - startedAt,
    };
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

    return {
      ok: false,
      runId: run.id,
      flagged: [],
      recommendations: [],
      skipped: [],
      discord: null,
      costCents: 0,
      durationMs: Date.now() - startedAt,
      error: msg,
    };
  }
}
