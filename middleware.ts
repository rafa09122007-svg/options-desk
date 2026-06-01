import { NextRequest, NextResponse } from "next/server";

type RateLimitConfig = {
  max: number;
  windowMs: number;
};

type RateRecord = {
  start: number;
  count: number;
};

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "/api/runs/analyze": { max: 10, windowMs: 60_000 },
  "/api/runs/full": { max: 5, windowMs: 5 * 60_000 },
  "/api/runs/post": { max: 10, windowMs: 60_000 },
  "/api/runs/screen": { max: 10, windowMs: 60_000 },
  "/api/cron/morning-brief": { max: 3, windowMs: 5 * 60_000 },
  "/api/cron/midday": { max: 3, windowMs: 5 * 60_000 },
  "/api/cron/eod-wrap": { max: 3, windowMs: 5 * 60_000 },
  "/api/discord/test": { max: 6, windowMs: 60_000 },
  "/api/health": { max: 60, windowMs: 60_000 },
  "/api/watchlist": { max: 60, windowMs: 60_000 },
};

const BOT_BLOCK_ROUTES = new Set([
  "/api/runs/analyze",
  "/api/runs/full",
  "/api/runs/post",
  "/api/runs/screen",
  "/api/discord/test",
]);

const BOT_UA_PATTERNS = [
  /^curl\//i,
  /^wget\//i,
  /^python-requests\//i,
  /^Go-http-client\//i,
  /^node-fetch\//i,
  /^libwww-perl\//i,
  /^Java\/[\d.]/i,
  /^okhttp\//i,
  /\bscrapy\b/i,
  /\bSemrushBot\b/i,
  /\bAhrefsBot\b/i,
  /\bMJ12bot\b/i,
  /\bDotBot\b/i,
  /\bPetalBot\b/i,
];

const globalRateStore = globalThis as typeof globalThis & {
  __optionsDeskRateStore?: Map<string, RateRecord>;
};

const store = globalRateStore.__optionsDeskRateStore ?? new Map<string, RateRecord>();
globalRateStore.__optionsDeskRateStore = store;

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  return req.headers.get("x-real-ip") || "unknown";
}

function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const rec = store.get(key);

  if (!rec || now - rec.start > windowMs) {
    store.set(key, { start: now, count: 1 });

    if (Math.random() < 0.01) {
      for (const [storedKey, value] of store.entries()) {
        if (now - value.start > windowMs * 4) store.delete(storedKey);
      }
    }

    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }

  rec.count += 1;

  if (rec.count > max) {
    return { allowed: false, remaining: 0, resetAt: rec.start + windowMs };
  }

  return { allowed: true, remaining: max - rec.count, resetAt: rec.start + windowMs };
}

function buildCsp() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://localhost:* ws://localhost:*",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse) {
  res.headers.set("Content-Security-Policy", buildCsp());
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  res.headers.set("X-XSS-Protection", "0");
  res.headers.delete("x-powered-by");
  return res;
}

export function middleware(req: NextRequest) {
  const pathname = normalizePath(req.nextUrl.pathname);

  if (BOT_BLOCK_ROUTES.has(pathname)) {
    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOT_UA_PATTERNS.some((rx) => rx.test(ua))) {
      return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const limit = RATE_LIMITS[pathname];
  if (limit) {
    const ip = getClientIp(req);
    const key = `${pathname}::${ip}`;
    const { allowed, remaining, resetAt } = rateLimit(key, limit.max, limit.windowMs);

    if (!allowed) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      return new NextResponse(JSON.stringify({ error: "Too many requests. Slow down." }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(resetAt / 1000)),
        },
      });
    }

    const res = NextResponse.next();
    res.headers.set("X-RateLimit-Limit", String(limit.max));
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.floor(resetAt / 1000)));
    return applySecurityHeaders(res);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png|robots.txt|sitemap.xml|manifest.json|.*\\..*).*)",
  ],
};
