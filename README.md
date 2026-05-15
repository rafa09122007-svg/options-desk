# Options Desk

An AI options analyst that scans your watchlist, identifies high-conviction setups, and delivers trade ideas to a dashboard and Discord. Advisory only — you execute.

## Architecture

```
Vercel Cron (3x/day)
      ↓
Haiku screener  →  flags interesting tickers
      ↓
Opus analyst    →  writes full thesis with confidence %
      ↓
Supabase        →  stores recommendations + outcomes
      ↓
Dashboard       →  view ideas, track P&L
Discord (Ralph) →  posts high-conviction setups
```

## Stack

- **Next.js 14** (App Router)
- **Supabase** (Postgres) — recommendations, watchlist, outcomes
- **Anthropic Claude** — Haiku for screening, Opus for theses
- **Alpaca** — options chains + market data
- **Vercel** — hosting + cron
- **Discord webhook** — alert delivery via Ralph

## Setup

1. Clone this repo into your Vercel project (auto-deploy from `main`)
2. Run the schema in `db/01_schema.sql` against your Supabase project
3. Set environment variables in Vercel (see `.env.local.example`)
4. Push to `main` — Vercel will build and deploy

## Project Structure

```
app/
  page.tsx            — main dashboard
  api/
    health/           — DB connection check
    watchlist/        — GET watchlist
lib/
  supabase.ts         — server-side Supabase client
  anthropic.ts        — Claude SDK client
  types.ts            — TypeScript types matching DB schema
```

## Phases

- [x] **Phase 1** — DB schema + watchlist
- [x] **Phase 2a** — Next.js scaffold + Supabase wiring
- [ ] **Phase 2b** — Haiku screener
- [ ] **Phase 2c** — Opus analyst
- [ ] **Phase 2d** — Vercel cron jobs
- [ ] **Phase 3a** — Dashboard polish + filters
- [ ] **Phase 3b** — Ralph Discord integration
