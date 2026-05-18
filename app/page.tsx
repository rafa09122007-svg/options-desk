import { supabaseAdmin } from "@/lib/supabase";
import type { Recommendation, Watchlist } from "@/lib/types";
import {
  triggerRunNow,
  analyzeTickerOnDemand,
  logOutcome,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [{ data: watchlist }, { data: recs }, { data: lastRun }] =
    await Promise.all([
      supabaseAdmin
        .from("watchlist")
        .select("*")
        .eq("active", true)
        .order("ticker")
        .returns<Watchlist[]>(),
      supabaseAdmin
        .from("recommendations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15)
        .returns<Recommendation[]>(),
      supabaseAdmin
        .from("daily_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const openCount = recs?.filter((r) => r.status === "open").length ?? 0;
  const takenCount = recs?.filter((r) => r.status === "taken").length ?? 0;
  const bestIdeas =
    recs?.filter((r) => r.conviction === "best_idea").length ?? 0;

  return (
    <main className="relative z-10 min-h-screen px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto max-w-6xl">
        {/* Masthead */}
        <header className="mb-10 border-b border-edge pb-8">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-paper-faint">
            <span>Daily Edition</span>
            <span className="tnum">{today}</span>
          </div>
          <h1 className="mt-4 font-display text-5xl font-medium tracking-tight md:text-6xl">
            Today on the <span className="italic text-gold">Desk</span>
          </h1>
          {lastRun && (
            <p className="mt-4 text-xs text-paper-faint">
              Last run:{" "}
              <span className="text-paper-muted">
                {lastRun.run_type.replaceAll("_", " ")}
              </span>{" "}
              ·{" "}
              <span className="tnum text-paper-muted">
                {new Date(lastRun.created_at).toLocaleString()}
              </span>{" "}
              · {lastRun.recommendations_generated} ideas ·{" "}
              <span className="tnum text-paper-muted">
                ${(lastRun.total_cost_cents / 100).toFixed(2)}
              </span>
            </p>
          )}
        </header>

        {/* Action toolbar */}
        <section className="mb-10 grid gap-4 md:grid-cols-2">
          <form action={triggerRunNow} className="panel p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
              Run Now
            </div>
            <p className="mt-1 text-sm text-paper-muted">
              Trigger the full pipeline immediately. Takes 30s–3min.
            </p>
            <button
              type="submit"
              className="mt-3 w-full rounded-sm border border-gold/40 bg-gold-glow px-4 py-2 font-medium text-gold transition-colors hover:bg-gold/20"
            >
              Run the desk
            </button>
          </form>

          <form action={analyzeTickerOnDemand} className="panel p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
              Analyze a ticker
            </div>
            <p className="mt-1 text-sm text-paper-muted">
              Force Opus to research and write a thesis on any ticker.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                name="ticker"
                placeholder="NVDA"
                required
                className="flex-1 rounded-sm border border-edge bg-ink px-3 py-2 font-mono text-sm uppercase tracking-wider text-paper placeholder-paper-faint focus:border-gold/40 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-sm border border-edge bg-ink-elevated px-4 py-2 text-sm font-medium text-paper transition-colors hover:border-gold/40"
              >
                Analyze
              </button>
            </div>
          </form>
        </section>

        {/* Stats */}
        <section className="mb-12 grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Watchlist" value={watchlist?.length ?? 0} />
          <Stat label="Open" value={openCount} />
          <Stat label="Taken" value={takenCount} accent="gold" />
          <Stat label="Best Ideas" value={bestIdeas} accent="gold" />
        </section>

        {/* Recommendations */}
        <Section
          eyebrow="The Picks"
          title="Recent Recommendations"
          subtitle="Trade ideas with thesis, sizing, and triggers. Mark each one once you act."
        >
          {recs && recs.length > 0 ? (
            <div className="space-y-3">
              {recs.map((r) => (
                <RecCard key={r.id} rec={r} />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </Section>

        <footer className="mt-24 border-t border-edge pt-6 text-[10px] uppercase tracking-[0.25em] text-paper-faint">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Advisory only — you execute the trade.</span>
            <span>Built for one analyst, one desk.</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "gold";
}) {
  return (
    <div className="border-l border-edge pl-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
        {label}
      </div>
      <div
        className={`mt-2 font-display text-4xl tnum ${
          accent === "gold" ? "text-gold" : "text-paper"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.25em] text-gold">
          {eyebrow}
        </div>
        <h2 className="mt-1 font-display text-2xl text-paper">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-paper-muted">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const dirChip =
    rec.direction === "bullish"
      ? "chip chip-bull"
      : rec.direction === "bearish"
      ? "chip chip-bear"
      : "chip chip-neutral";

  const statusChip =
    rec.status === "taken"
      ? "chip chip-gold"
      : rec.status === "closed"
      ? "chip chip-neutral"
      : rec.status === "invalidated"
      ? "chip chip-bear"
      : "chip chip-neutral";

  return (
    <article className="panel p-5 transition-colors hover:border-edge-strong">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xl font-semibold text-paper">
              {rec.ticker}
            </span>
            <span className={dirChip}>{rec.direction}</span>
            {rec.conviction === "best_idea" && (
              <span className="chip chip-gold">★ best idea</span>
            )}
            {rec.status !== "open" && (
              <span className={statusChip}>{rec.status}</span>
            )}
          </div>
          <div className="mt-1 text-sm text-paper-muted">
            {rec.strategy.replaceAll("_", " ")} · exp{" "}
            <span className="tnum">{rec.expiry}</span>
            {rec.strike && (
              <>
                {" "}· strike{" "}
                <span className="tnum">${rec.strike}</span>
              </>
            )}
            {rec.earnings_date && (
              <>
                {" "}· ⚠ earnings{" "}
                <span className="tnum">{rec.earnings_date}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
            Confidence
          </div>
          <div className="font-display text-3xl tnum text-paper">
            {rec.confidence}
            <span className="text-base text-paper-muted">%</span>
          </div>
        </div>
      </div>

      {/* Risk + position */}
      {(rec.max_risk_dollars != null || rec.position_size_contracts != null) && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-l-2 border-gold/40 bg-gold-glow/30 px-4 py-2">
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
              Risk
            </span>{" "}
            <span className="font-display text-2xl tnum text-gold">
              ${rec.max_risk_dollars != null ? Math.round(rec.max_risk_dollars) : "?"}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
              Size
            </span>{" "}
            <span className="font-mono text-base tnum text-paper">
              {rec.position_size_contracts ?? "?"}×
            </span>
          </div>
          {rec.entry_price != null && (
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                Entry
              </span>{" "}
              <span className="font-mono text-base tnum text-paper">
                ${rec.entry_price}
              </span>
            </div>
          )}
          {rec.target_price != null && (
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                Target
              </span>{" "}
              <span className="font-mono text-base tnum text-bull">
                ${rec.target_price}
              </span>
            </div>
          )}
          {rec.stop_price != null && (
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                Stop
              </span>{" "}
              <span className="font-mono text-base tnum text-bear">
                ${rec.stop_price}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Trigger condition */}
      {rec.entry_trigger_price != null && (
        <div className="mt-3 rounded-sm border border-edge bg-ink-elevated/50 px-4 py-2 text-sm">
          <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
            Entry trigger
          </span>{" "}
          <span className="text-paper">
            {rec.ticker} {rec.entry_trigger_direction}{" "}
            <span className="font-mono tnum">${rec.entry_trigger_price}</span>
            {rec.entry_trigger_time && (
              <span className="text-paper-muted">
                {" "}· {rec.entry_trigger_time}
              </span>
            )}
          </span>
          {rec.trigger_fired_at && (
            <span className="ml-3 chip chip-gold">
              ✓ triggered{" "}
              {new Date(rec.trigger_fired_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      <p className="mt-4 text-sm leading-relaxed text-paper line-clamp-3">
        {rec.thesis}
      </p>

      {/* Action row */}
      {rec.status === "open" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form action={logOutcome}>
            <input type="hidden" name="rec_id" value={rec.id} />
            <input type="hidden" name="action" value="took" />
            <button
              type="submit"
              className="rounded-sm border border-bull/40 bg-bull-glow px-3 py-1.5 text-xs font-medium text-bull transition-colors hover:bg-bull/20"
            >
              ✓ Took it
            </button>
          </form>
          <form action={logOutcome}>
            <input type="hidden" name="rec_id" value={rec.id} />
            <input type="hidden" name="action" value="passed" />
            <button
              type="submit"
              className="rounded-sm border border-edge bg-ink-elevated px-3 py-1.5 text-xs font-medium text-paper-muted transition-colors hover:border-bear/40 hover:text-bear"
            >
              ✕ Passed
            </button>
          </form>
          {rec.pine_script && (
            <details className="ml-auto">
              <summary className="cursor-pointer text-xs text-paper-faint hover:text-paper-muted">
                Show PINE alert
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-sm border border-edge bg-ink p-3 text-[11px] leading-relaxed text-paper-muted">
                {rec.pine_script}
              </pre>
            </details>
          )}
        </div>
      )}

      {rec.status === "taken" && (
        <div className="mt-4">
          <details>
            <summary className="cursor-pointer text-xs text-paper-faint hover:text-paper-muted">
              Close out this trade
            </summary>
            <form action={logOutcome} className="mt-3 space-y-2">
              <input type="hidden" name="rec_id" value={rec.id} />
              <input type="hidden" name="action" value="close" />
              <div className="flex gap-2">
                <input
                  name="exit_price"
                  placeholder="exit premium"
                  required
                  type="number"
                  step="0.01"
                  className="flex-1 rounded-sm border border-edge bg-ink px-3 py-1.5 font-mono text-xs text-paper placeholder-paper-faint focus:border-gold/40 focus:outline-none"
                />
                <input
                  name="notes"
                  placeholder="notes (optional)"
                  className="flex-1 rounded-sm border border-edge bg-ink px-3 py-1.5 text-xs text-paper placeholder-paper-faint focus:border-gold/40 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-sm border border-gold/40 bg-gold-glow px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/20"
                >
                  Log close
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="panel border-dashed p-10 text-center">
      <div className="font-display text-2xl italic text-paper-muted">
        The desk is quiet.
      </div>
      <p className="mt-2 text-sm text-paper-faint">
        Hit &quot;Run the desk&quot; above or analyze a specific ticker.
      </p>
    </div>
  );
}
