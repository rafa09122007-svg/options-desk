import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-edge bg-ink/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-12">
        <Link
          href="/"
          className="font-display text-xl tracking-tight text-paper"
        >
          Options <span className="italic text-gold">Desk</span>
        </Link>
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-paper-muted">
          <NavLink href="/">Brief</NavLink>
          <NavLink href="/watchlist">Watchlist</NavLink>
          <NavLink href="/scorecard">Scorecard</NavLink>
          <NavLink href="/costs">Costs</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm px-3 py-1.5 transition-colors hover:bg-ink-elevated hover:text-paper"
    >
      {children}
    </Link>
  );
}
