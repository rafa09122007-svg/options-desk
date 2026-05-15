// ============================================================
// Database row types — match the schema in 01_schema.sql
// ============================================================

export type Conviction = "low" | "medium" | "high" | "best_idea";
export type Direction = "bullish" | "bearish" | "neutral";
export type RecStatus = "open" | "taken" | "expired" | "invalidated" | "closed";
export type RunType = "morning_brief" | "midday" | "eod_wrap";

export type Watchlist = {
  id: number;
  ticker: string;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type Recommendation = {
  id: number;
  ticker: string;
  strategy: string;
  direction: Direction;
  setup_type: string | null;

  strike: number | null;
  strike_short: number | null;
  expiry: string;
  underlying_price: number | null;

  entry_price: number | null;
  target_price: number | null;
  stop_price: number | null;

  confidence: number;
  conviction: Conviction;
  score_technical: number | null;
  score_catalyst: number | null;
  score_options_pricing: number | null;
  score_event_risk: number | null;
  score_risk_reward: number | null;

  thesis: string;
  catalyst: string | null;
  invalidation: string | null;

  model: string | null;
  status: RecStatus;
  posted_to_discord: boolean;
  created_at: string;
  updated_at: string;
};

export type Outcome = {
  id: number;
  recommendation_id: number;
  took_trade: boolean;
  actual_entry: number | null;
  actual_exit: number | null;
  exit_date: string | null;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  notes: string | null;
  created_at: string;
};

export type ResearchLog = {
  id: number;
  ticker: string | null;
  run_type: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_cents: number | null;
  raw_output: string | null;
  created_at: string;
};

export type DailyRun = {
  id: number;
  run_date: string;
  run_type: RunType;
  tickers_screened: number;
  recommendations_generated: number;
  total_cost_cents: number;
  duration_ms: number | null;
  status: "running" | "success" | "partial" | "failed";
  error_message: string | null;
  created_at: string;
};
