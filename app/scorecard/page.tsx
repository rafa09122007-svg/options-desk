import { supabaseAdmin } from "@/lib/supabase";
import type { Outcome, Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";

type RecWithOutcomes = Recommendation & { outcomes: Outcome[] };

export default async function ScorecardPage() {
  // Pull all recs with their outcomes
  const { data: recsRaw } = await supabaseAdmin
    .from("recommendations")
    .select("*, outcomes(*)")
    .order("created_at", { ascending: false });

  const recs = (recsRaw as RecWithOutcomes[] | null) ?? [];

  // Take rate: of all recs the analyst produced, how many did Rafa actually trade?
  const totalRecs = recs.length;
  const takenRecs = recs.filter((r) => r.outcomes.some((o) => o.took_trade));
  const passedRecs = recs.filter((r) => r.outcomes.some((o) => !o.took_trade));
  const takeRate = totalRecs > 0 ? (takenRecs.length / totalRecs) * 100 : 0;

  // Closed P&L analysis
  const closed = takenRecs
    .map((r) => r.outcomes.find((o) => o.took_trade && o.pnl_dollars != null))
    .filter((o): o is Outcome => !!o);

  const wins = closed.filter((o) => (o.pnl_dollars ?? 0) > 0);
  const losses = closed.filter((o) => (o.pnl_dollars ?? 0) < 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

  const totalPnl = closed.reduce((sum, o) => sum + (o.pnl_dollars ?? 0), 0);
  const avgWin =
    wins.length > 0
      ? wins.reduce((s, o) => s + (o.pnl_dollars ?? 0), 0) / wins.length
      : 0;
  const avgLoss =
    losses.length > 0
      ? losses.reduce((s, o) => s + (o.pnl_dollars ?? 0), 0) / losses.length
      : 0;

  // By strategy
  const byStrategy = aggregate(takenRecs, "strategy");
  const bySetup = aggregate(
    takenRecs.filter((r) => r.setup_type),
    "setup_type"
  );
  const byConviction = aggregate(takenRecs, "conviction");

  return (
    <main className="relative z-10 min-h-screen px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 border-b border-edge pb-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold">
            Performance
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">
            Scorecard
          </h1>
          <p className="mt-2 text-sm text-paper-muted">
            How well the desk is calling it. Updates as you log outcomes.
          </p>
        </header>

        {/* Headline numbers */}
        <section className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatPanel
            label="Recs generated"
            value={totalRecs.toString()}
          />
          <StatPanel
            label="Take rate"
            value={`${takeRate.toFixed(0)}%`}
            sub={`${takenRecs.length} of ${totalRecs} taken`}
          />
          <StatPanel
            label="Win rate"
            value={`${winRate.toFixed(0)}%`}
            sub={`${wins.length}W / ${losses.length}L closed`}
          />
          <StatPanel
            label="Net P&L"
            value={fmtCurrency(totalPnl)}
            sub={`${closed.length} trades closed`}
            accent={totalPnl >= 0 ? "bull" : "bear"}
          />
        </section>

        {closed.length > 0 && (
          <section className="mb-12 grid grid-cols-2 gap-4">
            <StatPanel label="Avg win" value={fmtCurrency(avgWin)} accent="bull" />
            <StatPanel label="Avg loss" value={fmtCurrency(avgLoss)} accent="bear" />
          </section>
        )}

        {/* Breakdowns */}
        <BreakdownTable title="By Strategy" rows={byStrategy} />
        <BreakdownTable title="By Setup Type" rows={bySetup} />
        <BreakdownTable title="By Conviction" rows={byConviction} />

        {totalRecs === 0 && (
          <div className="panel border-dashed p-10 text-center">
            <div className="font-display text-2xl italic text-paper-muted">
              No data yet.
            </div>
            <p className="mt-2 text-sm text-paper-faint">
              Take a few trades, log the outcomes on the Brief page, and the
              scorecard will fill in.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

type AggRow = {
  key: string;
  total: number;
  wins: number;
  losses: number;
  pnl: number;
};

function aggregate(recs: RecWithOutcomes[], field: keyof Recommendation): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const r of recs) {
    const key = String(r[field] ?? "—").replaceAll("_", " ");
    const closed = r.outcomes.find(
      (o) => o.took_trade && o.pnl_dollars != null
    );
    const row = map.get(key) ?? { key, total: 0, wins: 0, losses: 0, pnl: 0 };
    row.total += 1;
    if (closed) {
      row.pnl += closed.pnl_dollars ?? 0;
      if ((closed.pnl_dollars ?? 0) > 0) row.wins += 1;
      else if ((closed.pnl_dollars ?? 0) < 0) row.losses += 1;
    }
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function BreakdownTable({ title, rows }: { title: string; rows: AggRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-display text-xl text-paper">{title}</h2>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-edge bg-ink-surface text-[10px] uppercase tracking-[0.2em] text-paper-faint">
            <tr>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-right">Taken</th>
              <th className="px-4 py-2 text-right">W / L</th>
              <th className="px-4 py-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-edge">
                <td className="px-4 py-2 text-paper">{r.key}</td>
                <td className="px-4 py-2 text-right tnum text-paper-muted">
                  {r.total}
                </td>
                <td className="px-4 py-2 text-right tnum text-paper-muted">
                  <span className="text-bull">{r.wins}</span>
                  {" / "}
                  <span className="text-bear">{r.losses}</span>
                </td>
                <td
                  className={`px-4 py-2 text-right tnum font-medium ${
                    r.pnl > 0
                      ? "text-bull"
                      : r.pnl < 0
                      ? "text-bear"
                      : "text-paper-muted"
                  }`}
                >
                  {fmtCurrency(r.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatPanel({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "bull" | "bear";
}) {
  const color =
    accent === "bull"
      ? "text-bull"
      : accent === "bear"
      ? "text-bear"
      : "text-paper";
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
        {label}
      </div>
      <div className={`mt-1 font-display text-3xl tnum ${color}`}>{value}</div>
      {sub && (
        <div className="mt-1 text-xs text-paper-faint tnum">{sub}</div>
      )}
    </div>
  );
}

function fmtCurrency(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
