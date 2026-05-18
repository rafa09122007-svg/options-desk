import type { Recommendation } from "./types";

/**
 * Generate a TradingView Pine Script alert for a recommendation.
 * The user pastes this into TradingView's Pine Editor on the ticker's chart,
 * adds the indicator, and configures an alert on the buy/sell condition.
 */
export function generatePineScript(rec: Recommendation): string {
  const direction = rec.direction;
  const ticker = rec.ticker;
  const triggerPrice = rec.entry_trigger_price ?? rec.underlying_price ?? rec.strike ?? 0;
  const triggerDir = rec.entry_trigger_direction ?? (direction === "bullish" ? "above" : "below");
  const stop = rec.stop_price;
  const target = rec.target_price;

  const condition =
    triggerDir === "above" ? "ta.crossover(close, trigger_price)"
    : triggerDir === "below" ? "ta.crossunder(close, trigger_price)"
    : "math.abs(close - trigger_price) < (close * 0.001)";

  const directionLabel = direction === "bullish" ? "LONG" : direction === "bearish" ? "SHORT" : "NEUTRAL";

  return `//@version=5
indicator("Options Desk — ${ticker} ${directionLabel}", overlay=true)

// === Trade Setup ===
// Strategy: ${rec.strategy.replaceAll("_", " ")}
// Setup: ${rec.setup_type?.replaceAll("_", " ") ?? "—"}
// Expiry: ${rec.expiry}
// Confidence: ${rec.confidence}% (${rec.conviction})

trigger_price = ${triggerPrice}
stop_price    = ${stop ?? "na"}
target_price  = ${target ?? "na"}

// === Entry condition ===
entry_condition = ${condition}

plot(trigger_price, "Entry trigger", color=color.yellow, linewidth=2)
${stop != null ? `plot(stop_price, "Stop", color=color.red, linewidth=1, style=plot.style_circles)` : "// no stop level"}
${target != null ? `plot(target_price, "Target", color=color.green, linewidth=1, style=plot.style_circles)` : "// no target level"}

plotshape(entry_condition, title="Entry", location=location.belowbar, color=${direction === "bullish" ? "color.green" : "color.red"}, style=shape.triangleup, size=size.small)

alertcondition(entry_condition, title="Options Desk ${ticker} entry trigger", message="${ticker} ${directionLabel} — entry trigger fired at {{close}}. ${rec.strategy.replaceAll("_", " ")}, ${rec.position_size_contracts ?? "1"} contracts, max risk $${rec.max_risk_dollars ?? "?"}.")`;
}
