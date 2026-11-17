/**
 * Mirror Eventide CDN product photos locally and attach them to catalog SKUs.
 * Eventide currently publishes only a handful of shared product assets via API
 * (vial / pen / serum). We map every Eventide + PrescribeUSA SKU to the best
 * matching real vendor asset — no AI/generated placeholders.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { prisma } from "../src/lib/prisma";

function loadEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv();

const ASSETS = {
  powder: {
    remote: "https://vitarelay.com/__l5e/assets-v1/0cffe580-da37-48f8-b0d1-5a07027e056b/lyophilized-powder.png",
    local: "public/vendor/eventide/lyophilized-powder.png",
    url: "/vendor/eventide/lyophilized-powder.png",
  },
  pen: {
    remote: "https://vitarelay.com/__l5e/assets-v1/7a5eff76-3f46-4d87-8a50-de34ef7f27ff/injection-pen.png",
    local: "public/vendor/eventide/injection-pen.png",
    url: "/vendor/eventide/injection-pen.png",
  },
  serum: {
    remote: "https://vitarelay.com/__l5e/assets-v1/93425fa8-8402-43ab-ba6b-edf2329a9d39/serum-bottle.png",
    local: "public/vendor/eventide/serum-bottle.png",
    url: "/vendor/eventide/serum-bottle.png",
  },
} as const;

type AssetKey = keyof typeof ASSETS;

async function download(remote: string, localRel: string) {
  const local = resolve(process.cwd(), localRel);
  mkdirSync(dirname(local), { recursive: true });
  const res = await fetch(remote, { cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`download failed ${remote} ${res.status}`);
  // @ts-expect-error Node fetch body is a web stream
  await pipeline(Readable.fromWeb(res.body), createWriteStream(local));
  return local;
}

function pickAsset(product: {
  name: string;
  form: string;
  category: string;
  productClass: string;
}): AssetKey {
  const blob = `${product.name} ${product.form} ${product.category}`.toLowerCase();
  if (/prescribeusa|pre-filled|injectable pen|\bpen\b/.test(blob)) return "pen";
  if (/serum|topical|cream|gel|lotion|drop/.test(blob)) return "serum";
  if (/capsule|tablet|troche|suppository|oral/.test(blob)) return "powder";
  if (/syringe|needle|bag|saline|supply|kit/.test(blob)) return "serum";
  if (/lyophil|powder|vial|injection|inj|solution|reconstit/.test(blob)) return "powder";
  if (product.productClass === "RND" || product.productClass === "503A" || product.productClass === "503B") {
    return "powder";
  }
  return "powder";
}

async function main() {
  console.log("Downloading Eventide CDN product photos…");
  for (const asset of Object.values(ASSETS)) {
    await download(asset.remote, asset.local);
    console.log("saved", asset.local);
  }

  // Prefer API-provided image when Eventide attached a specific asset path.
  const key = process.env.VITARELAY_API_KEY || process.env.EVENTIDE_API_KEY || "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  if (process.env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;

  const apiImageBySku = new Map<string, AssetKey>();
  for (let page = 1; page <= 80; page += 1) {
    const res = await fetch(`https://vitarelay.com/api/public/practice/v1/catalog?limit=100&page=${page}`, {
      headers,
      cache: "no-store",
    });
    const json = (await res.json()) as { data?: Array<{ id?: string; image_urls?: string[] }> };
    const rows = Array.isArray(json.data) ? json.data : [];
    if (!rows.length) break;
    for (const row of rows) {
      const id = String(row.id || "");
      const path = String(row.image_urls?.[0] || "");
      if (!id || !path) continue;
      if (path.includes("injection-pen")) apiImageBySku.set(id, "pen");
      else if (path.includes("serum-bottle")) apiImageBySku.set(id, "serum");
      else if (path.includes("lyophilized-powder")) apiImageBySku.set(id, "powder");
    }
    if (rows.length < 100) break;
  }

  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { category: { startsWith: "Eventide" } },
        { category: { startsWith: "PrescribeUSA" } },
        { productClass: { in: ["503A", "503B", "RND"] } },
      ],
    },
    select: { id: true, sku: true, name: true, form: true, category: true, productClass: true },
  });

  const counts: Record<AssetKey, number> = { powder: 0, pen: 0, serum: 0 };
  for (const product of products) {
    const keyName =
      apiImageBySku.get(product.sku) ||
      (/^PrescribeUSA/i.test(product.category) ? "pen" : pickAsset(product));
    const url = ASSETS[keyName].url;
    await prisma.product.update({ where: { id: product.id }, data: { imageUrl: url } });
    counts[keyName] += 1;
  }

  console.log(
    JSON.stringify(
      {
        productsUpdated: products.length,
        counts,
        note: "These are real Eventide CDN product photos mirrored locally. Eventide only publishes 3 shared product assets via API today.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
