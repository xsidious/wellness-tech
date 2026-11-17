import { createHash, randomBytes } from "crypto";

const DAILY_API = "https://api.daily.co/v1";

export function dailyConfigured() {
  return Boolean((process.env.DAILY_API_KEY || "").trim());
}

function apiKey() {
  return (process.env.DAILY_API_KEY || "").trim();
}

function domain() {
  return (process.env.DAILY_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function hashJoinToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function mintJoinToken() {
  return randomBytes(24).toString("hex");
}

export async function createDailyRoom(input: {
  name?: string;
  durationMin?: number;
  startsAt?: Date;
}) {
  const key = apiKey();
  if (!key) {
    const fallback = `wt-${randomBytes(6).toString("hex")}`;
    return {
      ok: true as const,
      provider: "jitsi" as const,
      roomName: fallback,
      url: `https://meet.jit.si/${fallback}`,
    };
  }

  const roomName =
    input.name?.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64) ||
    `wt-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const exp =
    input.startsAt && input.durationMin
      ? Math.floor(input.startsAt.getTime() / 1000) + Math.max(30, input.durationMin) * 60 + 3600
      : Math.floor(Date.now() / 1000) + 60 * 60 * 6;

  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: roomName,
      privacy: "private",
      properties: {
        exp,
        enable_waiting_room: true,
        enable_screenshare: true,
        enable_chat: true,
        start_video_off: false,
        start_audio_off: false,
        eject_at_room_exp: true,
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    name?: string;
    url?: string;
    error?: string;
    info?: string;
  };
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error || data.info || `Daily room create failed (${res.status})`,
    };
  }
  const name = data.name || roomName;
  const host = domain();
  const url = data.url || (host ? `https://${host}/${name}` : `https://wellnesstech.daily.co/${name}`);
  return { ok: true as const, provider: "daily" as const, roomName: name, url };
}

export async function createDailyMeetingToken(input: {
  roomName: string;
  userName: string;
  isOwner?: boolean;
  expSeconds?: number;
}) {
  const key = apiKey();
  if (!key) {
    return { ok: true as const, token: "", url: `https://meet.jit.si/${input.roomName}` };
  }
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name: input.roomName,
        user_name: input.userName.slice(0, 80),
        is_owner: Boolean(input.isOwner),
        enable_screenshare: true,
        start_video_off: false,
        exp: input.expSeconds || Math.floor(Date.now() / 1000) + 60 * 60 * 4,
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !data.token) {
    return { ok: false as const, error: data.error || `Daily token failed (${res.status})` };
  }
  const host = domain();
  const base = host ? `https://${host}/${input.roomName}` : `https://wellnesstech.daily.co/${input.roomName}`;
  return { ok: true as const, token: data.token, url: `${base}?t=${data.token}` };
}
