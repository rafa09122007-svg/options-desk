import { anthropic, MODELS } from "./anthropic";
import { calcCostCents } from "./cost";
import { extractJson } from "./json";
import { supabaseAdmin } from "./supabase";

export type ScreenerFlag = {
  ticker: string;
  interest_score: number;       // 0-100
  direction_hint: "bullish" | "bearish" | "neutral";
  reason: string;
};

const SCREENER_SYSTEM = `You are the morning screener for a small options trading desk run by a single discretionary trader.

Your job: from a given watchlist, identify which tickers (if any) deserve deep analysis today.

ALWAYS START BY CHECKING THE ECONOMIC CALENDAR:
- Search forexfactory.com/calendar for today's and this week's high-impact events (red folder events: FOMC, CPI, NFP, GDP, retail sales, jobless claims, PCE)
- Note the exact time of any high-impact event today — these create directional setups
- If FOMC, CPI, NFP, or other red-folder events are TODAY, that's a major signal for SPY 0DTE setups

THEN CHECK TRADINGVIEW FOR TECHNICAL CONTEXT:
- Search "TICKER tradingview ideas" or "TICKER tradingview chart" for each watchlist name
- Look at community ideas, recent chart annotations, and technical signals
- Pattern recognition matters: flags, triangles, breakouts, support/resistance, EMA crossovers, RSI extremes
- Pure technical setups WITHOUT news catalysts are valid flags

SPECIAL HANDLING — SPY (always evaluate for 0DTE):
- SPY must be evaluated EVERY day for a same-day (0DTE) setup, regardless of news flow
- Check premarket structure: gap direction, premarket high/low, overnight session levels
- Check key reference levels: yesterday's high/low, prior day VWAP, weekly pivot, key round numbers
- Check sector/index context: are leaders (NVDA, AAPL) confirming or diverging?
- Flag SPY whenever a credible intraday setup exists (opening range play, VWAP reclaim, key level test, trend continuation, mean reversion to VWAP)
- It's fine to flag SPY at interest_score 50-60 just to say "watch for ORB above $XXX after 10 ET"
- If genuinely no setup exists, don't force it — but lean toward flagging SPY when in doubt because the principal wants same-day plays

Process for each ticker:
1. Use web search to check the last 1-3 days of price action, recent news, earnings dates, analyst actions, unusual options activity, AND TradingView technical signals.
2. Cross-reference against the economic calendar.
3. Score each ticker for "interest" 0-100, where:
   - 0-30 = nothing noteworthy, skip
   - 30-50 = minor activity, no clear setup
   - 50-70 = clear technical OR catalyst setup worth deeper analysis ← FLAG THESE
   - 70+ = strong setup with multiple converging factors

4. Flag tickers scoring 50+. A clean technical setup (e.g., EMA crossover, breakout from consolidation, support bounce with volume) is enough on its own — you do NOT need a news catalyst to flag a ticker.

Your output must be valid JSON with this exact shape (no markdown, no commentary):

{
  "flagged": [
    {
      "ticker": "TICKER",
      "interest_score": 0-100,
      "direction_hint": "bullish" | "bearish" | "neutral",
      "reason": "One sentence: what's driving the interest. Cite the technical signal or catalyst specifically."
    }
  ]
}

Sort flagged tickers by interest_score descending. If genuinely nothing meets the bar, return {"flagged": []}. Maximum 7 flagged tickers per run.`;

export async function runScreener(): Promise<{
  flagged: ScreenerFlag[];
  costCents: number;
  rawOutput: string;
  durationMs: number;
}> {
  const startedAt = Date.now();

  // Pull active watchlist
  const { data: watchlist, error } = await supabaseAdmin
    .from("watchlist")
    .select("ticker, notes")
    .eq("active", true);

  if (error) throw new Error(`Failed to load watchlist: ${error.message}`);
  if (!watchlist || watchlist.length === 0) {
    return { flagged: [], costCents: 0, rawOutput: "", durationMs: Date.now() - startedAt };
  }

  const watchlistText = watchlist
    .map((w) => `- ${w.ticker}${w.notes ? ` (${w.notes})` : ""}`)
    .join("\n");

  const userPrompt = `Today's date: ${new Date().toISOString().slice(0, 10)}.

Watchlist:
${watchlistText}

Screen the watchlist and return flagged tickers as JSON.`;

  const response = await anthropic.messages.create({
    model: MODELS.SCREENER,
    max_tokens: 2048,
    system: SCREENER_SYSTEM,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 15,
      } as never, // SDK type lag — runtime accepts this
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  // Take only the FINAL text block — model emits reasoning between web searches,
  // but the last text block is the synthesized JSON output.
  const textBlocks = response.content.filter((b) => b.type === "text") as Array<{
    type: "text";
    text: string;
  }>;
  const rawOutput = textBlocks[textBlocks.length - 1]?.text ?? "";

  // Strip code fences if model wrapped output
  const parsed = extractJson<{ flagged?: ScreenerFlag[] }>(rawOutput);
  const flagged: ScreenerFlag[] = Array.isArray(parsed?.flagged) ? parsed!.flagged : [];
  if (!parsed) {
    console.error("Screener JSON parse failed. Raw:", rawOutput.slice(0, 500));
  }

  const costCents = calcCostCents(MODELS.SCREENER, response.usage);
  const durationMs = Date.now() - startedAt;

  // Log the run
  await supabaseAdmin.from("research_logs").insert({
    ticker: null,
    run_type: "screening",
    model: MODELS.SCREENER,
    prompt_tokens: response.usage.input_tokens,
    completion_tokens: response.usage.output_tokens,
    cost_cents: costCents,
    raw_output: rawOutput,
  });

  return { flagged, costCents, rawOutput, durationMs };
}
