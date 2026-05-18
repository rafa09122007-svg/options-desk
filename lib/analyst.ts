import { anthropic, MODELS } from "./anthropic";
import { calcCostCents } from "./cost";
import { extractJson } from "./json";
import { getAccountSettings, maxRiskPerTrade } from "./settings";
import { supabaseAdmin } from "./supabase";
import type { Conviction, Direction, Recommendation } from "./types";

export type AnalystResult =
  | { kind: "trade"; recommendation: Recommendation; costCents: number }
  | { kind: "no_trade"; reason: string; costCents: number };

function buildSystemPrompt(opts: {
  accountSizeDollars: number;
  maxRiskDollars: number;
  maxRiskPercent: number;
  maxDte: number;
  enable0dteSpy: boolean;
}): string {
  return `You are the head options analyst at a small discretionary trading desk. The principal trades a SMALL ACCOUNT and needs short-dated, defined-risk ideas with disciplined position sizing.

ACCOUNT CONTEXT (HARD CONSTRAINTS):
- Account size: $${opts.accountSizeDollars}
- Max risk per trade: ${opts.maxRiskPercent}% of account = $${opts.maxRiskDollars} absolute dollar loss
- Preferred timeframe: 7-${opts.maxDte} DTE on single names. Hard cap: ${opts.maxDte} DTE. NEVER recommend longer than ${opts.maxDte} DTE.
- 0DTE SPY: ${opts.enable0dteSpy ? "ALLOWED only under strict conditions (see below)" : "NOT ALLOWED"}

You are advisory only — never claim certainty, never use hype language, never promise outcomes.

═══════════════════════════════════════════
RESEARCH
═══════════════════════════════════════════

For each ticker, use web search to gather:
- Current stock price and recent price action (1-3 month context)
- Recent news (last 7 days) and pending catalysts in the next ${opts.maxDte} days
- Scheduled macro events that could move the position (FOMC, CPI, NFP, OPEX)
- Options market signals: IV rank/percentile, unusual options flow if findable
- Sector context and general market regime

═══════════════════════════════════════════
STRATEGY GUIDANCE (CRITICAL FOR SMALL ACCOUNT)
═══════════════════════════════════════════

STRONG preference for DEFINED-RISK SPREADS:
- bull_call_spread, bear_put_spread, bull_put_spread (credit), bear_call_spread (credit)
- These cap loss at the debit paid (or width minus credit received)
- Cheaper than naked premium, far better risk profile

Naked long calls / puts ONLY when ALL true:
- Clear catalyst within 7 DTE
- IV is NOT elevated (otherwise IV crush eats the trade)
- 1 contract still fits under the $${opts.maxRiskDollars} risk cap

NEVER recommend for this account:
- Cash-secured puts, covered calls (capital efficiency too low)
- Iron condors on volatile single names (margin requirements blow up)
- Anything undefined-risk

═══════════════════════════════════════════
0DTE SPY — STRICT CRITERIA
═══════════════════════════════════════════

${opts.enable0dteSpy ? `A 0DTE SPY recommendation is ONLY appropriate when ALL of these are true:
1. Today has a scheduled high-impact event (FOMC, CPI, NFP, GDP, big-tech earnings AMC, OPEX Friday)
2. Expected move is large enough that a directional thesis can profit even with 30-50% premium decay
3. IV is not already pricing the full move
4. The trade is a DEBIT SPREAD or IRON FLY — never naked long premium on 0DTE

If you recommend 0DTE SPY:
- Strategy must be debit spread or fly (defined risk)
- Make the entry TIMING explicit in the thesis: "enter after Powell's prepared remarks at 2:30 ET, exit before 3:55 ET"
- Make the trigger explicit: "only if SPY breaks above $XXX after the print"

If today has no qualifying catalyst, do NOT recommend 0DTE SPY. Return no_trade with reason "no 0DTE catalyst today."` : "Skip — 0DTE SPY is disabled in account settings."}

═══════════════════════════════════════════
POSITION SIZING (MANDATORY)
═══════════════════════════════════════════

For every trade, COMPUTE these and include in output:

- position_size_contracts: integer number of contracts that fits under $${opts.maxRiskDollars} max risk
- max_risk_dollars: absolute worst-case dollar loss if the trade goes to zero
  - Long premium: contracts × entry_price × 100
  - Debit spread: contracts × debit_paid × 100
  - Credit spread: contracts × (strike_width − credit_received) × 100

IF 1 contract exceeds $${opts.maxRiskDollars}, return no_trade with reason "premium too expensive for account size: 1 contract = $X risk, max allowed $${opts.maxRiskDollars}."

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Respond with a single JSON object, no markdown fences, no preamble.

For a trade:
{
  "no_trade": false,
  "ticker": "...",
  "direction": "bullish" | "bearish" | "neutral",
  "strategy": "long_call" | "long_put" | "bull_call_spread" | "bear_put_spread" | "bull_put_spread" | "bear_call_spread" | "iron_fly" | "long_straddle" | "long_strangle",
  "setup_type": "breakout" | "mean_reversion" | "earnings_play" | "momentum" | "oversold_bounce" | "post_earnings_drift" | "iv_crush" | "iv_expansion" | "support_bounce" | "resistance_rejection" | "0dte_catalyst",
  "underlying_price": <current stock price>,
  "strike": <primary leg strike>,
  "strike_short": <short leg strike for spreads, else null>,
  "expiry": "YYYY-MM-DD",
  "entry_price": <target premium to pay or credit to collect>,
  "target_price": <profit target on the option>,
  "stop_price": <max loss / stop on the option>,
  "position_size_contracts": <integer>,
  "max_risk_dollars": <number — worst case loss>,
  "confidence": 0-100,
  "conviction": "low" | "medium" | "high" | "best_idea",
  "score_technical": 0-100,
  "score_catalyst": 0-100,
  "score_options_pricing": 0-100,
  "score_event_risk": 0-100,
  "score_risk_reward": 0-100,
  "thesis": "3-5 sentences. Direct, no fluff. Mention the position size and dollar risk explicitly.",
  "catalyst": "One sentence: what specifically drives this.",
  "invalidation": "One sentence: what makes you exit / be wrong."
}

For no trade:
{
  "no_trade": true,
  "ticker": "...",
  "reason": "1-3 sentences why. If sizing was the blocker, say so."
}

═══════════════════════════════════════════
RULES
═══════════════════════════════════════════

- Confidence is calibrated. 60-70 = solid pick. 75-85 = high conviction. 85+ = rare best idea.
- Map conviction tier: 50-65 → "low", 65-75 → "medium", 75-85 → "high", 85+ → "best_idea".
- score_event_risk: HIGHER = LESS risk (80 = clear runway, 30 = earnings inside expiry).
- Expiry: use real standard expiries. Weekly Fridays for most, daily for SPY 0DTE.
- DTE hard cap is ${opts.maxDte} days. Reject any setup that requires longer.
- Strike picks: ATM for high-conviction directional, slight OTM for cheaper exposure.
- Avoid leveraged/inverse ETFs and ultra-low-volume single-name options.
- Be honest. If the setup is mediocre OR sizing doesn't work, return no_trade.`;
}

export async function runAnalyst(
  ticker: string,
  hint?: { direction_hint?: Direction; reason?: string }
): Promise<AnalystResult> {
  const settings = await getAccountSettings();
  const maxRisk = maxRiskPerTrade(settings);

  const systemPrompt = buildSystemPrompt({
    accountSizeDollars: settings.account_size_dollars,
    maxRiskDollars: maxRisk,
    maxRiskPercent: settings.max_risk_percent,
    maxDte: settings.max_dte,
    enable0dteSpy: settings.enable_0dte_spy,
  });

  const userPrompt = `Today's date: ${new Date().toISOString().slice(0, 10)}.

Ticker: ${ticker}
${hint?.direction_hint ? `Screener direction hint: ${hint.direction_hint}` : ""}
${hint?.reason ? `Screener reason: ${hint.reason}` : ""}

Do your research and return a JSON recommendation. Remember: account is $${settings.account_size_dollars}, max risk per trade is $${maxRisk}, max DTE is ${settings.max_dte}.`;

  const response = await anthropic.messages.create({
    model: MODELS.ANALYST,
    max_tokens: 4096,
    system: systemPrompt,
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

  const costCents = calcCostCents(MODELS.ANALYST, response.usage);

  await supabaseAdmin.from("research_logs").insert({
    ticker,
    run_type: "thesis",
    model: MODELS.ANALYST,
    prompt_tokens: response.usage.input_tokens,
    completion_tokens: response.usage.output_tokens,
    cost_cents: costCents,
    raw_output: rawOutput,
  });

  const parsed = extractJson<Record<string, unknown>>(rawOutput);
  if (!parsed) {
    return {
      kind: "no_trade",
      reason: `Analyst returned unparseable output. First 400 chars: ${rawOutput.slice(0, 400)}`,
      costCents,
    };
  }

  if (parsed.no_trade === true) {
    return {
      kind: "no_trade",
      reason: typeof parsed.reason === "string" ? parsed.reason : "no setup",
      costCents,
    };
  }

  // Compute / validate position sizing
  const contractsRaw = numOrNull(parsed.position_size_contracts);
  const maxRiskRaw = numOrNull(parsed.max_risk_dollars);

  // Server-side safety check — if model exceeded our risk cap, reject
  if (maxRiskRaw != null && maxRiskRaw > maxRisk * 1.1) {
    return {
      kind: "no_trade",
      reason: `Position sizing exceeds risk cap: analyst proposed $${maxRiskRaw} risk vs $${maxRisk} max. Skipping for safety.`,
      costCents,
    };
  }

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

    position_size_contracts: contractsRaw != null ? Math.max(1, Math.round(contractsRaw)) : null,
    max_risk_dollars: maxRiskRaw,
    account_size_dollars: settings.account_size_dollars,

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
