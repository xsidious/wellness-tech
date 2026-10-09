/**
 * Lightweight anti-bot helpers for Edge + Node.
 * - Honeypot: bots fill hidden fields → reject silently
 * - Rate limit: in-memory sliding window by IP/key
 * Optional Cloudflare Turnstile when TURNSTILE_SECRET_KEY is set.
 */

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();

export function clientIp(req: Request | { headers: Headers }) {
  const h = "headers" in req ? req.headers : (req as Request).headers;
  const fwd = h.get("x-forwarded-for") || h.get("x-real-ip") || "";
  return fwd.split(",")[0]?.trim() || "unknown";
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return { ok: false as const, retryAfterMs: windowMs - (now - bucket.hits[0]) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true as const };
}

/** Returns true if the request looks like a bot (honeypot filled). */
export function honeypotTripped(formData: FormData, field = "company_website") {
  const value = String(formData.get(field) || "").trim();
  return value.length > 0;
}

export function securityHeaders(res: Response) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  if (!res.headers.has("Content-Security-Policy")) {
    res.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https:;",
    );
  }
  return res;
}

export async function verifyTurnstile(token: string, ip?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true as const, skipped: true };
  if (!token) return { ok: false as const, error: "Bot check failed." };
  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      ...(ip && ip !== "unknown" ? { remoteip: ip } : {}),
    });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? { ok: true as const } : { ok: false as const, error: "Bot check failed." };
  } catch {
    return { ok: false as const, error: "Bot check unavailable." };
  }
}
