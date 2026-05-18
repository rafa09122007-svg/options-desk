import { supabaseAdmin } from "@/lib/supabase";
import { updateSettings } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { data: settings } = await supabaseAdmin
    .from("account_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const s = settings ?? {
    account_size_dollars: 1500,
    max_risk_percent: 15,
    max_dte: 14,
    enable_0dte_spy: true,
    prefer_spreads: true,
    discord_min_conviction: "medium",
  };

  return (
    <main className="relative z-10 min-h-screen px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10 border-b border-edge pb-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold">
            Configure
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">
            Settings
          </h1>
          <p className="mt-2 text-sm text-paper-muted">
            How the desk sizes positions and delivers picks. Changes take effect
            on the next run.
          </p>
        </header>

        <form action={updateSettings} className="space-y-6">
          <Field
            label="Account size"
            hint="Total capital available for options trades."
            prefix="$"
          >
            <input
              name="account_size_dollars"
              type="number"
              step="1"
              defaultValue={s.account_size_dollars}
              className={inputClass}
            />
          </Field>

          <Field
            label="Max risk per trade"
            hint="Hard cap on dollar loss per single position."
            suffix="% of account"
          >
            <input
              name="max_risk_percent"
              type="number"
              step="1"
              defaultValue={s.max_risk_percent}
              className={inputClass}
            />
          </Field>

          <Field
            label="Max DTE"
            hint="Longest expiration the analyst will recommend."
            suffix="days"
          >
            <input
              name="max_dte"
              type="number"
              step="1"
              defaultValue={s.max_dte}
              className={inputClass}
            />
          </Field>

          <Field
            label="Discord delivery threshold"
            hint="Minimum conviction tier that triggers a Discord post."
          >
            <select
              name="discord_min_conviction"
              defaultValue={s.discord_min_conviction ?? "medium"}
              className={inputClass}
            >
              <option value="low">low (everything)</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="best_idea">best idea only</option>
            </select>
          </Field>

          <Toggle
            name="enable_0dte_spy"
            label="Daily SPY 0DTE evaluation"
            hint="Force SPY through the analyst every run, even when screener skips it."
            defaultChecked={s.enable_0dte_spy}
          />

          <Toggle
            name="prefer_spreads"
            label="Prefer defined-risk spreads"
            hint="Strong bias toward debit/credit spreads over naked premium."
            defaultChecked={s.prefer_spreads}
          />

          <div className="pt-4">
            <button
              type="submit"
              className="rounded-sm border border-gold/40 bg-gold-glow px-6 py-3 font-medium text-gold transition-colors hover:bg-gold/20"
            >
              Save settings
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-sm border border-edge bg-ink px-3 py-2 font-mono text-sm text-paper placeholder-paper-faint focus:border-gold/40 focus:outline-none";

function Field({
  label,
  hint,
  prefix,
  suffix,
  children,
}: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
          {label}
        </span>
        <div className="mt-2 flex items-center gap-3">
          {prefix && <span className="text-paper-muted">{prefix}</span>}
          {children}
          {suffix && <span className="text-paper-muted">{suffix}</span>}
        </div>
      </label>
      {hint && <p className="mt-1 text-xs text-paper-faint">{hint}</p>}
    </div>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 panel p-4">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-gold"
      />
      <div>
        <div className="text-sm font-medium text-paper">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-paper-faint">{hint}</p>}
      </div>
    </label>
  );
}
