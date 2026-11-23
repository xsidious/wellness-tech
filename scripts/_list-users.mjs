import fs from "fs";
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
const users = await p.user.findMany({
  select: {
    email: true,
    roles: true,
    passwordHash: true,
    mfaHash: true,
    mfaEnabled: true,
    name: true,
    lastLoginAt: true,
  },
  orderBy: { email: "asc" },
});
console.log("users", users.length);
for (const u of users) {
  console.log(
    JSON.stringify({
      email: u.email,
      name: u.name,
      roles: u.roles,
      hasPassword: Boolean(u.passwordHash),
      hasMfa: Boolean(u.mfaHash),
      mfaEnabled: u.mfaEnabled,
      lastLoginAt: u.lastLoginAt,
    }),
  );
}
await p.$disconnect();
