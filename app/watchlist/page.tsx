import { supabaseAdmin } from "@/lib/supabase";
import type { Watchlist } from "@/lib/types";
import {
  addToWatchlist,
  toggleWatchlistActive,
  removeFromWatchlist,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const { data: watchlist } = await supabaseAdmin
    .from("watchlist")
    .select("*")
    .order("active", { ascending: false })
    .order("ticker")
    .returns<Watchlist[]>();

  return (
    <main className="relative z-10 min-h-screen px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 border-b border-edge pb-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold">
            Tracked
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">
            Watchlist
          </h1>
          <p className="mt-2 text-sm text-paper-muted">
            Tickers the desk scans each session. Add the names you actually
            trade.
          </p>
        </header>

        {/* Add form */}
        <form action={addToWatchlist} className="panel mb-8 p-4">
          <div className="flex gap-2">
            <input
              name="ticker"
              placeholder="TICKER"
              required
              className="w-32 rounded-sm border border-edge bg-ink px-3 py-2 font-mono text-sm uppercase tracking-wider text-paper placeholder-paper-faint focus:border-gold/40 focus:outline-none"
            />
            <input
              name="notes"
              placeholder="notes (e.g. 'oil major — your sector')"
              className="flex-1 rounded-sm border border-edge bg-ink px-3 py-2 text-sm text-paper placeholder-paper-faint focus:border-gold/40 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-sm border border-gold/40 bg-gold-glow px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20"
            >
              + Add
            </button>
          </div>
        </form>

        {/* List */}
        <div className="space-y-2">
          {watchlist?.map((w) => (
            <div
              key={w.id}
              className={`panel flex items-center gap-3 p-3 ${
                w.active ? "" : "opacity-50"
              }`}
            >
              <span className="w-20 font-mono font-semibold text-paper">
                {w.ticker}
              </span>
              <span className="flex-1 text-sm text-paper-muted">
                {w.notes || (
                  <span className="text-paper-faint italic">no notes</span>
                )}
              </span>
              <form action={toggleWatchlistActive}>
                <input type="hidden" name="id" value={w.id} />
                <input
                  type="hidden"
                  name="active"
                  value={(!w.active).toString()}
                />
                <button
                  type="submit"
                  className="rounded-sm border border-edge bg-ink-elevated px-3 py-1.5 text-xs text-paper-muted transition-colors hover:border-gold/40 hover:text-paper"
                >
                  {w.active ? "Pause" : "Resume"}
                </button>
              </form>
              <form action={removeFromWatchlist}>
                <input type="hidden" name="id" value={w.id} />
                <button
                  type="submit"
                  className="rounded-sm border border-edge bg-ink-elevated px-3 py-1.5 text-xs text-paper-muted transition-colors hover:border-bear/40 hover:text-bear"
                >
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
