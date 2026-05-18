"use server";

import { revalidatePath } from "next/cache";
import { runAnalyst } from "@/lib/analyst";
import { runFullPipeline } from "@/lib/pipeline";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// Outcomes — "took it" / "passed" / "closed"
// ============================================================

export async function logOutcome(formData: FormData): Promise<void> {
  const recId = Number(formData.get("rec_id"));
  const action = String(formData.get("action"));
  const exitPrice = formData.get("exit_price")
    ? Number(formData.get("exit_price"))
    : null;
  const entryPrice = formData.get("entry_price")
    ? Number(formData.get("entry_price"))
    : null;
  const notes = (formData.get("notes") as string) || null;

  if (!recId) return;

  if (action === "took") {
    await supabaseAdmin.from("outcomes").insert({
      recommendation_id: recId,
      took_trade: true,
      actual_entry: entryPrice,
      notes,
    });
    await supabaseAdmin
      .from("recommendations")
      .update({ status: "taken" })
      .eq("id", recId);
  } else if (action === "passed") {
    await supabaseAdmin.from("outcomes").insert({
      recommendation_id: recId,
      took_trade: false,
      notes,
    });
    await supabaseAdmin
      .from("recommendations")
      .update({ status: "invalidated" })
      .eq("id", recId);
  } else if (action === "close") {
    const { data: existing } = await supabaseAdmin
      .from("outcomes")
      .select("*")
      .eq("recommendation_id", recId)
      .eq("took_trade", true)
      .maybeSingle();

    const actualEntry = existing?.actual_entry ?? entryPrice ?? 0;
    const pnlDollars =
      actualEntry && exitPrice ? (exitPrice - actualEntry) * 100 : null;
    const pnlPercent =
      actualEntry && exitPrice
        ? ((exitPrice - actualEntry) / actualEntry) * 100
        : null;

    await supabaseAdmin
      .from("outcomes")
      .update({
        actual_exit: exitPrice,
        exit_date: new Date().toISOString().slice(0, 10),
        pnl_dollars: pnlDollars,
        pnl_percent: pnlPercent,
        notes,
      })
      .eq("recommendation_id", recId)
      .eq("took_trade", true);

    await supabaseAdmin
      .from("recommendations")
      .update({ status: "closed" })
      .eq("id", recId);
  }

  revalidatePath("/");
  revalidatePath("/scorecard");
}

// ============================================================
// Watchlist CRUD
// ============================================================

export async function addToWatchlist(formData: FormData): Promise<void> {
  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();
  const notes = (formData.get("notes") as string) || null;
  if (!ticker) return;

  await supabaseAdmin
    .from("watchlist")
    .upsert({ ticker, notes, active: true }, { onConflict: "ticker" });

  revalidatePath("/");
  revalidatePath("/watchlist");
}

export async function toggleWatchlistActive(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "true";
  if (!id) return;

  await supabaseAdmin
    .from("watchlist")
    .update({ active })
    .eq("id", id);

  revalidatePath("/");
  revalidatePath("/watchlist");
}

export async function removeFromWatchlist(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  await supabaseAdmin.from("watchlist").delete().eq("id", id);

  revalidatePath("/");
  revalidatePath("/watchlist");
}

// ============================================================
// Settings
// ============================================================

export async function updateSettings(formData: FormData): Promise<void> {
  const update = {
    account_size_dollars: Number(formData.get("account_size_dollars")) || 1500,
    max_risk_percent: Number(formData.get("max_risk_percent")) || 15,
    max_dte: Number(formData.get("max_dte")) || 14,
    enable_0dte_spy: formData.get("enable_0dte_spy") === "on",
    prefer_spreads: formData.get("prefer_spreads") === "on",
    discord_min_conviction:
      (formData.get("discord_min_conviction") as string) || "medium",
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin.from("account_settings").update(update).eq("id", 1);

  revalidatePath("/");
  revalidatePath("/settings");
}

// ============================================================
// Manual triggers — Run Now + On-demand analyzer
// ============================================================

export async function triggerRunNow(_formData: FormData): Promise<void> {
  const { data: settings } = await supabaseAdmin
    .from("account_settings")
    .select("discord_min_conviction")
    .eq("id", 1)
    .maybeSingle();
  const minConv = (settings?.discord_min_conviction ?? "medium") as
    | "low"
    | "medium"
    | "high"
    | "best_idea";

  await runFullPipeline({
    runType: "midday",
    minConvictionToPost: minConv,
  });

  revalidatePath("/");
}

export async function analyzeTickerOnDemand(formData: FormData): Promise<void> {
  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();
  if (!ticker) return;

  await runAnalyst(ticker);

  revalidatePath("/");
}
