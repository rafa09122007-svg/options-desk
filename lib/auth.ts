import { NextRequest } from "next/server";

/**
 * Authorize a run request. Accepts CRON_SECRET via either:
 *   - Authorization: Bearer <secret>   (Vercel cron / API clients)
 *   - ?key=<secret>                    (manual browser testing)
 */
export function authorize(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: "CRON_SECRET not set on server" };

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return { ok: true };

  const queryKey = req.nextUrl.searchParams.get("key");
  if (queryKey === secret) return { ok: true };

  // Vercel cron sends this header automatically
  if (req.headers.get("x-vercel-cron")) return { ok: true };

  return { ok: false, reason: "unauthorized" };
}
