import { supabaseAdmin } from "./supabase";
import type { Recommendation, Conviction } from "./types";

// Embed colors (decimal RGB) — match the dashboard palette
const COLOR_BULL = 0x5fbf80;
const COLOR_BEAR = 0xe06464;
const COLOR_NEUTRAL = 0xa59a85;
const COLOR_GOLD = 0xc9a85a;

const CONVICTION_RANK: Record<Conviction, number> = {
  low: 0,
  medium: 1,
  high: 2,
  best_idea: 3,
};

const BOT_USERNAME = "Options Desk";

// ============================================================
// Embed formatting
// ============================================================

function colorFor(rec: Recommendation): number {
  if (rec.conviction === "best_idea") return COLOR_GOLD;
  if (rec.direction === "bullish") return COLOR_BULL;
  if (rec.direction === "bearish") return COLOR_BEAR;
  return COLOR_NEUTRAL;
}

function emojiFor(rec: Recommendation): string {
  if (rec.conviction === "best_idea") return "⭐";
  if (rec.direction === "bullish") return "🟢";
  if (rec.direction === "bearish") return "🔴";
  return "⚪";
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

type Embed = {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
  timestamp: string;
};

function buildEmbed(rec: Recommendation): Embed {
  const fields: Embed["fields"] = [
    { name: "Confidence", value: `${rec.confidence}%`, inline: true },
    {
      name: "Conviction",
      value: rec.conviction.replaceAll("_", " "),
      inline: true,
    },
    {
      name: "Setup",
      value: rec.setup_type?.replaceAll("_", " ") ?? "—",
      inline: true,
    },
  ];

  // Risk + position sizing — prominent
  if (rec.max_risk_dollars != null || rec.position_size_contracts != null) {
    const contracts = rec.position_size_contracts ?? "?";
    const risk = rec.max_risk_dollars != null ? `$${Math.round(rec.max_risk_dollars)}` : "?";
    fields.push({
      name: "💰 Position",
      value: `**${contracts}** contract${contracts === 1 ? "" : "s"} · max risk **${risk}**`,
      inline: false,
    });
  }

  const strikeText =
    rec.strike != null
      ? rec.strike_short != null
        ? `$${rec.strike} / $${rec.strike_short}`
        : `$${rec.strike}`
      : "—";
  fields.push({ name: "Strikes", value: strikeText, inline: true });
  fields.push({ name: "Expiry", value: rec.expiry, inline: true });
  fields.push({
    name: "Underlying",
    value: fmtMoney(rec.underlying_price),
    inline: true,
  });

  fields.push({
    name: "Entry / Target / Stop",
    value: `${fmtMoney(rec.entry_price)} → ${fmtMoney(rec.target_price)} (stop ${fmtMoney(rec.stop_price)})`,
    inline: false,
  });

  if (rec.catalyst) {
    fields.push({
      name: "Catalyst",
      value: rec.catalyst.slice(0, 1024),
      inline: false,
    });
  }
  if (rec.invalidation) {
    fields.push({
      name: "Invalidation",
      value: rec.invalidation.slice(0, 1024),
      inline: false,
    });
  }

  return {
    title: `${emojiFor(rec)}  ${rec.ticker} — ${rec.strategy.replaceAll("_", " ")} (${rec.direction})`,
    description: rec.thesis.slice(0, 2000),
    color: colorFor(rec),
    fields,
    footer: { text: `${rec.model ?? "claude"} · rec #${rec.id}` },
    timestamp: rec.created_at,
  };
}

function buildHeader(recs: Recommendation[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (recs.length === 0) {
    return `**Brief — ${date}**\n_Quiet tape. Desk passed on every name. Save the powder._`;
  }

  const tiers = {
    best_idea: recs.filter((r) => r.conviction === "best_idea").length,
    high: recs.filter((r) => r.conviction === "high").length,
    medium: recs.filter((r) => r.conviction === "medium").length,
    low: recs.filter((r) => r.conviction === "low").length,
  };

  const breakdown = Object.entries(tiers)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k.replace("_", " ")}`)
    .join(", ");

  const tickers = recs.map((r) => r.ticker).join(", ");

  return `**Brief — ${date}**\n${recs.length} idea${recs.length === 1 ? "" : "s"} on the board today (${breakdown}): ${tickers}.`;
}

// ============================================================
// Posting
// ============================================================

export type PostResult =
  | { ok: true; posted: number }
  | { ok: false; reason: string };

/** Post a set of recommendations to Discord and mark them as posted. */
export async function postRecsToDiscord(
  recs: Recommendation[],
  opts: { quietPostWhenEmpty?: boolean } = {}
): Promise<PostResult> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, reason: "DISCORD_WEBHOOK_URL not set" };

  if (recs.length === 0) {
    if (!opts.quietPostWhenEmpty) {
      return { ok: true, posted: 0 };
    }
    // Post the quiet-day message
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: BOT_USERNAME,
        content: buildHeader([]),
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: `Discord rejected quiet post: ${res.status} ${await res.text()}`,
      };
    }
    return { ok: true, posted: 0 };
  }

  // Sort by conviction (high first), then confidence
  const sorted = [...recs].sort((a, b) => {
    const c = CONVICTION_RANK[b.conviction] - CONVICTION_RANK[a.conviction];
    return c !== 0 ? c : b.confidence - a.confidence;
  });

  // Discord cap: 10 embeds per message
  const chunks: Recommendation[][] = [];
  for (let i = 0; i < sorted.length; i += 10) {
    chunks.push(sorted.slice(i, i + 10));
  }

  for (let i = 0; i < chunks.length; i++) {
    const payload: Record<string, unknown> = {
      username: BOT_USERNAME,
      embeds: chunks[i].map(buildEmbed),
    };
    // Header only on first message
    if (i === 0) payload.content = buildHeader(sorted);

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: `Discord rejected message ${i + 1}: ${res.status} ${await res.text()}`,
      };
    }
  }

  // Mark all recs as posted
  const ids = sorted.map((r) => r.id);
  await supabaseAdmin
    .from("recommendations")
    .update({ posted_to_discord: true })
    .in("id", ids);

  return { ok: true, posted: sorted.length };
}

/** Send a one-off test embed to verify the webhook works. */
export async function postTestMessage(): Promise<PostResult> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, reason: "DISCORD_WEBHOOK_URL not set" };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: BOT_USERNAME,
      content: `**Options Desk — webhook test** _${new Date().toLocaleString()}_`,
      embeds: [
        {
          title: "🟢  Sample — bull call spread (bullish)",
          description:
            "If you see this in #options-desk, the webhook is live and the desk can deliver to Discord.",
          color: COLOR_BULL,
          fields: [
            { name: "Confidence", value: "72%", inline: true },
            { name: "Conviction", value: "high", inline: true },
          ],
          footer: { text: "test message · no rec saved" },
        },
      ],
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      reason: `Discord rejected test: ${res.status} ${await res.text()}`,
    };
  }
  return { ok: true, posted: 1 };
}
