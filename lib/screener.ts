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

Process for each ticker:
1. Use web search to check the last 1-3 days of price action, recent news, earnings dates, analyst actions, and any unusual options activity.
2. Score each ticker for "interest" 0-100, where:
   - 0-40 = nothing noteworthy, skip
   - 40-65 = some activity but no clear setup
   - 65-85 = clear catalyst or technical setup worth deeper analysis
   - 85+ = strong setup with multiple converging factors

3. Only flag tickers scoring 60+. Be selective — quiet days should produce few or no flags. A morning with nothing is a totally acceptable result.

Your output must be valid JSON with this exact shape (no markdown, no commentary):

{
  "flagged": [
    {
      "ticker": "TICKER",
      "interest_score": 0-100,
      "direction_hint": "bullish" | "bearish" | "neutral",
      "reason": "One sentence: what's driving the interest."
    }
  ]
}

Sort flagged tickers by interest_score descending. If nothing meets the bar, return {"flagged": []}. Maximum 5 flagged tickers per run.`;

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
        max_uses: 8,
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
