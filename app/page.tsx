import { supabaseAdmin } from "@/lib/supabase";
import type { Recommendation, Watchlist } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [{ data: watchlist, error: wlError }, { data: recs }, { data: lastRun }] =
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
        .limit(10)
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
  const bestIdeas = recs?.filter((r) => r.conviction === "best_idea").length ?? 0;

  return (
    <main className="relative z-10 min-h-screen px-6 py-10 md:px-12 md:py-16">
      <div className="mx-auto max-w-6xl">
        {/* Masthead */}
        <header className="mb-16 border-b border-edge pb-10">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-paper-faint">
            <span>No. 001 — Daily Edition</span>
            <span className="tnum">{today}</span>
          </div>
          <h1 className="mt-6 font-display text-6xl font-medium tracking-tight md:text-7xl">
            Options{" "}
            <span className="italic text-gold">Desk</span>
          </h1>
          <p className="mt-4 max-w-xl font-display text-lg italic text-paper-muted">
            An analyst that reads the tape so you don&apos;t have to.
          </p>
          {lastRun && (
            <p className="mt-6 text-xs text-paper-faint">
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
              </span>{" "}
              spent
            </p>
          )}
        </header>

        {wlError && (
          <div className="mb-8 rounded-sm border border-bear/30 bg-bear-glow p-4 font-mono text-sm text-bear">
            DB connection failed: {wlError.message}
          </div>
        )}

        {/* Stats — asymmetric, editorial */}
        <section className="mb-16 grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Watchlist" value={watchlist?.length ?? 0} />
          <Stat label="Open Ideas" value={openCount} />
          <Stat label="Best Ideas" value={bestIdeas} accent="gold" />
          <Stat label="Total Posted" value={recs?.length ?? 0} />
        </section>

        {/* Watchlist */}
        <Section
          eyebrow="Tracked"
          title="The Watchlist"
          subtitle="Tickers the desk is scanning each session."
        >
          <div className="flex flex-wrap gap-2">
            {watchlist?.map((w) => (
              <div
                key={w.id}
                className="group relative cursor-default rounded-sm border border-edge bg-ink-card px-3 py-2 transition-colors hover:border-edge-strong hover:bg-ink-elevated"
                title={w.notes ?? undefined}
              >
                <span className="font-mono text-sm font-semibold text-paper">
                  {w.ticker}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* Recommendations */}
        <Section
          eyebrow="The Picks"
          title="Recent Recommendations"
          subtitle="Trade ideas with thesis, confidence, and risk."
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

        {/* Footer */}
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

  return (
    <article className="panel p-5 transition-colors hover:border-edge-strong">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-semibold text-paper">
              {rec.ticker}
            </span>
            <span className={dirChip}>{rec.direction}</span>
            {rec.conviction === "best_idea" && (
              <span className="chip chip-gold">★ best idea</span>
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
      <p className="mt-4 text-sm leading-relaxed text-paper line-clamp-3">
        {rec.thesis}
      </p>
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
        Wire up the screener and analyst, set the cron, and ideas will start
        appearing here.
      </p>
    </div>
  );
}
