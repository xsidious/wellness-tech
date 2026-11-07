import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/anti-bot";

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_LIMIT = 5;
const LOCK_MS = 30 * 60 * 1000;
const IP_LOGIN_LIMIT = 12;
const IP_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function requestClientMeta() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for") || h.get("x-real-ip") || "";
  const ip = fwd.split(",")[0]?.trim() || "unknown";
  const ua = (h.get("user-agent") || "").slice(0, 300);
  const origin = h.get("origin") || "";
  const host = h.get("host") || "";
  const fetchSite = (h.get("sec-fetch-site") || "").toLowerCase();
  return { ip, ua, origin, host, fetchSite };
}

/** Reject cross-site form posts (CSRF-style). */
export function assertSameOrigin(meta: { origin: string; host: string; fetchSite?: string }) {
  if (meta.fetchSite === "cross-site") {
    return { ok: false as const, error: "Request blocked for security." };
  }
  if (!meta.origin || !meta.host) return { ok: true as const };
  try {
    const originHost = new URL(meta.origin).host;
    if (originHost !== meta.host) {
      return { ok: false as const, error: "Request blocked for security." };
    }
  } catch {
    return { ok: false as const, error: "Request blocked for security." };
  }
  return { ok: true as const };
}

/** Equalize response timing so attackers can't probe account existence as easily. */
export async function authTimingPad() {
  const ms = 320 + Math.floor(Math.random() * 280);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertStrongPassword(password: string) {
  if (password.length < 10) {
    return { ok: false as const, error: "Password must be at least 10 characters." };
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return { ok: false as const, error: "Password needs upper and lower case letters." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false as const, error: "Password needs at least one number." };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false as const, error: "Password needs at least one symbol." };
  }
  const lowered = password.toLowerCase();
  if (["password", "wellnesstech", "1234567890", "qwertyuiop"].some((w) => lowered.includes(w))) {
    return { ok: false as const, error: "Choose a less common password." };
  }
  return { ok: true as const };
}

export async function assertNotRateLimited(ip: string, email: string) {
  const byIp = rateLimit(`wt-auth-ip:${ip}`, IP_LOGIN_LIMIT, IP_LOGIN_WINDOW_MS);
  if (!byIp.ok) return { ok: false as const, error: "Too many sign-in attempts from this network. Try again later." };
  const byEmail = rateLimit(`wt-auth-email:${email}`, FAIL_LIMIT + 2, FAIL_WINDOW_MS);
  if (!byEmail.ok) return { ok: false as const, error: "Too many attempts for this account. Try again later." };
  return { ok: true as const };
}

export async function assertNotLockedOut(email: string) {
  const since = new Date(Date.now() - LOCK_MS);
  const recentFails = await prisma.auditEvent.findMany({
    where: {
      action: "auth.login_failed",
      object: email,
      createdAt: { gt: since },
    },
    orderBy: { createdAt: "desc" },
    take: FAIL_LIMIT,
    select: { createdAt: true },
  });
  if (recentFails.length < FAIL_LIMIT) return { ok: true as const };

  const oldestInBurst = recentFails[recentFails.length - 1]?.createdAt;
  if (!oldestInBurst) return { ok: true as const };
  const unlockAt = oldestInBurst.getTime() + LOCK_MS;
  if (Date.now() < unlockAt) {
    const mins = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60000));
    return {
      ok: false as const,
      error: `Account temporarily locked after failed sign-ins. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }
  return { ok: true as const };
}

export async function recordLoginFailure(email: string, ip: string, reason: string) {
  await audit({
    action: "auth.login_failed",
    object: email,
    after: reason.slice(0, 120),
    ip,
  });
  await authTimingPad();
}

export async function recordLoginSuccess(userId: string, email: string, ip: string, method: string, ua = "") {
  await audit({
    actorId: userId,
    action: "auth.login_success",
    object: email,
    after: `${method}${ua ? `|ua:${ua.slice(0, 80)}` : ""}`.slice(0, 180),
    ip,
  });
}

export function genericAuthError() {
  return "Invalid email or password.";
}
