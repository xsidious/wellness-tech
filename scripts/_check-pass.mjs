import fs from "fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i);
  const v = line.slice(i + 1).replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}
const p = new PrismaClient();
const pairs = [
  ["admin@thewellnesstech.com", "WellnessTech#Admin9!"],
  ["owner@fairfax.demo", "PracticeLogin#9!"],
  ["affiliate@sales.demo", "AffiliateLogin#9!"],
  ["vjesu001@yahoo.com", "AffiliateLogin#9!"],
];
for (const [email, pass] of pairs) {
  const u = await p.user.findUnique({ where: { email } });
  const ok = u?.passwordHash ? await bcrypt.compare(pass, u.passwordHash) : false;
  console.log(email, ok ? "OK" : "FAIL", "roles", u?.roles, "mfa", Boolean(u?.mfaHash));
}
await p.$disconnect();
