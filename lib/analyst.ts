import { anthropic, MODELS } from "./anthropic";
import { calcCostCents } from "./cost";
import { supabaseAdmin } from "./supabase";
import type { Conviction, Direction, Recommendation } from "./types";

export type AnalystResult =
  | { kind: "trade"; recommendation: Recommendation; costCents: number }
  | { kind: "no_trade"; reason: string; costCents: number };

const ANALYST_SYSTEM = `You are the head options analyst at a small discretionary trading desk. The desk's principal will read your output and decide whether to execute. You are advisory only — never claim certainty, never use hype language, never promise outcomes.

For each ticker assigned, use web search to gather:
- Current stock price and recent price action (1-3 month context)
- Recent news (last 7 days) and any pending catalysts in the next 30 days (earnings, product launches, regulatory events, Fed days)
- Analyst sentiment / price targets if available
- Options market signals: IV rank/percentile if findable, unusual options flow
- Sector context and general market regime

Then write ONE high-quality options trade idea. If the setup isn't there, say so honestly.

OUTPUT FORMAT: respond with a single JSON object, no markdown fences, no preamble.

For a trade:
{
  "no_trade": false,
  "ticker": "...",
  "direction": "bullish" | "bearish" | "neutral",
  "strategy": "long_call" | "long_put" | "bull_call_spread" | "bear_put_spread" | "iron_condor" | "covered_call" | "cash_secured_put" | "long_straddle" | "long_strangle",
  "setup_type": "breakout" | "mean_reversion" | "earnings_play" | "momentum" | "oversold_bounce" | "post_earnings_drift" | "iv_crush" | "iv_expansion" | "support_bounce" | "resistance_rejection",
  "underlying_price": <current stock price>,
  "strike": <primary leg strike>,
  "strike_short": <short leg strike for spreads, else null>,
  "expiry": "YYYY-MM-DD",
  "entry_price": <target premium to pay or credit to collect>,
  "target_price": <profit target on the option>,
  "stop_price": <max loss / stop on the option>,
  "confidence": 0-100,
  "conviction": "low" | "medium" | "high" | "best_idea",
  "score_technical": 0-100,
  "score_catalyst": 0-100,
  "score_options_pricing": 0-100,
  "score_event_risk": 0-100,
  "score_risk_reward": 0-100,
  "thesis": "3-5 sentences. Direct, no fluff. The kind of thing you'd say to a colleague at the next desk.",
  "catalyst": "One sentence: what specifically drives this.",
  "invalidation": "One sentence: what makes you exit / be wrong."
}

For no trade:
{
  "no_trade": true,
  "ticker": "...",
  "reason": "1-3 sentences why."
}

RULES:
- Confidence is calibrated. 60-70 = solid pick. 75-85 = high conviction. 85+ = rare best idea (use sparingly).
- Map conviction tier: 50-65 → "low", 65-75 → "medium", 75-85 → "high", 85+ → "best_idea".
- score_event_risk: HIGHER = LESS risk (e.g. 80 = clear runway, 30 = earnings inside expiry).
- Expiry: prefer 14-45 DTE unless it's an earnings play (weeklies OK). Use real standard expiries (Fridays).
- Strike picks: ATM for high-conviction directional, slight OTM for cheaper exposure, ITM for high-delta if you really love it.
- Avoid leveraged/inverse ETFs and ultra-low-volume single-name options.
- Be honest. If the setup is mediocre, return no_trade.`;

export async function runAnalyst(ticker: string, hint?: {
  direction_hint?: Direction;
  reason?: string;
}): Promise<AnalystResult> {
  const userPrompt = `Today's date: ${new Date().toISOString().slice(0, 10)}.

Ticker: ${ticker}
${hint?.direction_hint ? `Screener direction hint: ${hint.direction_hint}` : ""}
${hint?.reason ? `Screener reason: ${hint.reason}` : ""}

Do your research and return a JSON recommendation.`;

  const response = await anthropic.messages.create({
    model: MODELS.ANALYST,
    max_tokens: 3072,
    system: [
      {
        type: "text",
        text: ANALYST_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 12,
      } as never,
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlocks = response.content.filter((b) => b.type === "text") as Array<{
    type: "text";
    text: string;
  }>;
  const rawOutput = textBlocks[textBlocks.length - 1]?.text ?? "";
  const cleaned = rawOutput.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  const costCents = calcCostCents(MODELS.ANALYST, response.usage);

  // Log every call regardless of outcome
  await supabaseAdmin.from("research_logs").insert({
    ticker,
    run_type: "thesis",
    model: MODELS.ANALYST,
    prompt_tokens: response.usage.input_tokens,
    completion_tokens: response.usage.output_tokens,
    cost_cents: costCents,
    raw_output: rawOutput,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { kind: "no_trade", reason: "Analyst returned unparseable output", costCents };
  }

  if (parsed.no_trade === true) {
    return {
      kind: "no_trade",
      reason: typeof parsed.reason === "string" ? parsed.reason : "no setup",
      costCents,
    };
  }

  // Map to recommendation row
  const conviction = (parsed.conviction ?? "medium") as Conviction;
  const insertRow = {
    ticker: (parsed.ticker as string) ?? ticker,
    strategy: parsed.strategy as string,
    direction: parsed.direction as Direction,
    setup_type: (parsed.setup_type as string) ?? null,

    strike: numOrNull(parsed.strike),
    strike_short: numOrNull(parsed.strike_short),
    expiry: parsed.expiry as string,
    underlying_price: numOrNull(parsed.underlying_price),

    entry_price: numOrNull(parsed.entry_price),
    target_price: numOrNull(parsed.target_price),
    stop_price: numOrNull(parsed.stop_price),

    confidence: clampInt(parsed.confidence, 0, 100),
    conviction,
    score_technical: numOrNull(parsed.score_technical),
    score_catalyst: numOrNull(parsed.score_catalyst),
    score_options_pricing: numOrNull(parsed.score_options_pricing),
    score_event_risk: numOrNull(parsed.score_event_risk),
    score_risk_reward: numOrNull(parsed.score_risk_reward),

    thesis: (parsed.thesis as string) ?? "",
    catalyst: (parsed.catalyst as string) ?? null,
    invalidation: (parsed.invalidation as string) ?? null,

    model: MODELS.ANALYST,
    status: "open" as const,
    posted_to_discord: false,
  };

  const { data: saved, error: insErr } = await supabaseAdmin
    .from("recommendations")
    .insert(insertRow)
    .select()
    .single();

  if (insErr || !saved) {
    return { kind: "no_trade", reason: `DB insert failed: ${insErr?.message}`, costCents };
  }

  return { kind: "trade", recommendation: saved as Recommendation, costCents };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
