// Cost in dollars per million tokens. Update if Anthropic changes pricing.
const PRICING: Record<string, { input: number; output: number; cached: number }> = {
  "claude-opus-4-7":           { input: 5,    output: 25,  cached: 0.50 },
  "claude-sonnet-4-6":         { input: 3,    output: 15,  cached: 0.30 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4,   cached: 0.08 },
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

/** Returns cost in cents (rounded to nearest hundredth of a cent). */
export function calcCostCents(model: string, usage: Usage): number {
  const price = PRICING[model];
  if (!price) return 0;

  const inputCost      = (usage.input_tokens / 1_000_000) * price.input;
  const outputCost     = (usage.output_tokens / 1_000_000) * price.output;
  const cacheReadCost  = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * price.cached;
  // Cache writes are billed at 1.25x input rate
  const cacheWriteCost = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * price.input * 1.25;

  const totalDollars = inputCost + outputCost + cacheReadCost + cacheWriteCost;
  return Math.round(totalDollars * 10_000) / 100; // dollars → cents w/ 2 decimal places
}
