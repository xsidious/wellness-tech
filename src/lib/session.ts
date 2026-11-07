import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { readSession, signSession } from "@/lib/crypto";

const SESSION = "wt_session";
const PENDING = "wt_pending";

function cookieBase(maxAge: number) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}

/** 4-hour absolute session; refreshed only by signing in again. */
const SESSION_MS = 1000 * 60 * 60 * 4;
const PENDING_MS = 1000 * 60 * 15;

export async function setLogin(userId: string) {
  const exp = Date.now() + SESSION_MS;
  const sid = randomBytes(16).toString("hex");
  const token = signSession(`${userId}|${exp}|${sid}`);
  const jar = await cookies();
  jar.set(SESSION, token, cookieBase(Math.floor(SESSION_MS / 1000)));
  jar.delete(PENDING);
}

export async function setPending(email: string) {
  const exp = Date.now() + PENDING_MS;
  const token = signSession(`${email}|${exp}|pending`);
  const jar = await cookies();
  jar.set(PENDING, token, cookieBase(Math.floor(PENDING_MS / 1000)));
}

export async function readPending() {
  const token = (await cookies()).get(PENDING)?.value;
  if (!token) return null;
  const payload = readSession(token);
  if (!payload) return null;
  const [email, exp, kind] = payload.split("|");
  if (kind !== "pending" || Number(exp) < Date.now()) return null;
  return email;
}

export async function readUserId() {
  const token = (await cookies()).get(SESSION)?.value;
  if (!token) return null;
  const payload = readSession(token);
  if (!payload) return null;
  const [userId, exp] = payload.split("|");
  if (!userId || Number(exp) < Date.now()) return null;
  return userId;
}

export async function clearLogin() {
  const jar = await cookies();
  jar.delete(SESSION);
  jar.delete(PENDING);
}
