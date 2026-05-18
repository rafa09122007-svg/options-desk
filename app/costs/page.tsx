import { supabaseAdmin } from "@/lib/supabase";
import type { DailyRun, ResearchLog } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const [{ data: runs }, { data: logs }] = await Promise.all([
    supabaseAdmin
      .from("daily_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<DailyRun[]>(),
    supabaseAdmin
      .from("research_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<ResearchLog[]>(),
  ]);

  const totalCents = (runs ?? []).reduce(
    (s, r) => s + (r.total_cost_cents ?? 0),
    0
  );

  // Group by day
  const byDay = new Map<string, number>();
  for (const r of runs ?? []) {
    const day = r.run_date;
    byDay.set(day, (byDay.get(day) ?? 0) + (r.total_cost_cents ?? 0));
  }
  const daySeries = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, cents]) => ({ day, cents }));

  // Group logs by model
  const byModel = new Map<string, { calls: number; cents: number }>();
  for (const l of logs ?? []) {
    const m = byModel.get(l.model) ?? { calls: 0, cents: 0 };
    m.calls += 1;
    m.cents += l.cost_cents ?? 0;
    byModel.set(l.model, m);
  }

  return (
    <main className="relative z-10 min-h-screen px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 border-b border-edge pb-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold">
            Spend
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">
            Costs
          </h1>
          <p className="mt-2 text-sm text-paper-muted">
            What the desk is spending on Claude API calls. Watch this so it
            never gets out of hand.
          </p>
        </header>

        <section className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatPanel
            label="Total spent"
            value={`$${(totalCents / 100).toFixed(2)}`}
            sub={`${runs?.length ?? 0} runs logged`}
          />
          <StatPanel
            label="Avg per run"
            value={
              runs && runs.length > 0
                ? `$${(totalCents / 100 / runs.length).toFixed(2)}`
                : "—"
            }
          />
          <StatPanel
            label="Last 7 days"
            value={`$${
              ((daySeries.slice(-7).reduce((s, d) => s + d.cents, 0)) / 100).toFixed(2)
            }`}
          />
        </section>

        {/* Daily series */}
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-paper">Daily spend</h2>
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-edge bg-ink-surface text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                <tr>
                  <th className="px-4 py-2 text-left">Day</th>
                  <th className="px-4 py-2 text-right">Spend</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {daySeries
                  .slice()
                  .reverse()
                  .map((d) => {
                    const maxCents = Math.max(...daySeries.map((x) => x.cents));
                    const widthPct = maxCents > 0 ? (d.cents / maxCents) * 100 : 0;
                    return (
                      <tr key={d.day} className="border-t border-edge">
                        <td className="px-4 py-2 text-paper-muted tnum">
                          {d.day}
                        </td>
                        <td className="px-4 py-2 text-right tnum text-paper">
                          ${(d.cents / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-2 w-full overflow-hidden rounded-sm bg-ink">
                            <div
                              className="h-full bg-gold/50"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        {/* By model */}
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-paper">By Model</h2>
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-edge bg-ink-surface text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                <tr>
                  <th className="px-4 py-2 text-left">Model</th>
                  <th className="px-4 py-2 text-right">Calls</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byModel.entries()).map(([model, data]) => (
                  <tr key={model} className="border-t border-edge">
                    <td className="px-4 py-2 font-mono text-paper">{model}</td>
                    <td className="px-4 py-2 text-right tnum text-paper-muted">
                      {data.calls}
                    </td>
                    <td className="px-4 py-2 text-right tnum text-paper">
                      ${(data.cents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tnum text-paper-muted">
                      ${(data.cents / 100 / data.calls).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatPanel({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl tnum text-paper">{value}</div>
      {sub && <div className="mt-1 text-xs text-paper-faint">{sub}</div>}
    </div>
  );
}
