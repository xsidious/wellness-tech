import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

function material(name: "SESSION_SECRET" | "FIELD_KEY" | "RXCORE_WEBHOOK_SECRET") {
  const value = (process.env[name] || "").trim();
  if (!value || value.length < 16) {
    throw new Error(`${name} is missing.`);
  }
  return createHash("sha256").update(value).digest();
}

export function signSession(payload: string) {
  const mac = createHmac("sha256", material("SESSION_SECRET")).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function readSession(token: string) {
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const payload = token.slice(0, cut);
  const mac = token.slice(cut + 1);
  const expected = createHmac("sha256", material("SESSION_SECRET")).update(payload).digest("hex");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return payload;
}

export function encryptField(plain: string) {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material("FIELD_KEY"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${data.toString("hex")}`;
}

export function decryptField(packed: string) {
  if (!packed) return "";
  const [ivHex, tagHex, dataHex] = packed.split(".");
  const decipher = createDecipheriv("aes-256-gcm", material("FIELD_KEY"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

export function signWebhook(body: string) {
  return createHmac("sha256", material("RXCORE_WEBHOOK_SECRET")).update(body).digest("hex");
}

export function verifyWebhook(body: string, signature: string) {
  const expected = signWebhook(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function tokenizeLast4(last4: string) {
  if (!/^\d{4}$/.test(last4)) {
    throw new Error("Only the last four digits may be sent.");
  }
  return { token: `tok_sandbox_${randomBytes(12).toString("hex")}`, last4 };
}

export function rejectCardNumber(value: string) {
  return /\d{13,19}/.test(value.replace(/\s+/g, ""));
}
