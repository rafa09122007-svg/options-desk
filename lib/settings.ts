import { supabaseAdmin } from "./supabase";

export type AccountSettings = {
  account_size_dollars: number;
  max_risk_percent: number;
  prefer_spreads: boolean;
  enable_0dte_spy: boolean;
  max_dte: number;
};

const DEFAULTS: AccountSettings = {
  account_size_dollars: 1500,
  max_risk_percent: 15,
  prefer_spreads: true,
  enable_0dte_spy: true,
  max_dte: 14,
};

let cached: { value: AccountSettings; at: number } | null = null;
const TTL_MS = 60_000; // re-read settings at most once per minute

export async function getAccountSettings(): Promise<AccountSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const { data, error } = await supabaseAdmin
    .from("account_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    cached = { value: DEFAULTS, at: Date.now() };
    return DEFAULTS;
  }

  const value: AccountSettings = {
    account_size_dollars: Number(data.account_size_dollars) || DEFAULTS.account_size_dollars,
    max_risk_percent: Number(data.max_risk_percent) || DEFAULTS.max_risk_percent,
    prefer_spreads: Boolean(data.prefer_spreads),
    enable_0dte_spy: Boolean(data.enable_0dte_spy),
    max_dte: Number(data.max_dte) || DEFAULTS.max_dte,
  };

  cached = { value, at: Date.now() };
  return value;
}

/** Max dollar loss a single trade is allowed to absorb. */
export function maxRiskPerTrade(settings: AccountSettings): number {
  return Math.round(settings.account_size_dollars * (settings.max_risk_percent / 100));
}
