/**
 * Fill Eventide + PrescribeUSA practice prices from every source we have:
 * 1) VitaRelay public catalog price_cents
 * 2) Local eventide-formulary.json (wholesale dollars)
 * 3) PrescribeUSA pens catalog
 *
 * Remaining Eventide zeros get a category median fallback so the marketplace
 * never shows "Price not set" — flagged in description as estimate until Eventide
 * attaches a practice price list.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { prescribeUsaPensCatalog } from "../src/lib/prescribeusa-pens-catalog";
import { partnerPriceCentsFromFormulary, WT_FORMULARY_MARKUP } from "../src/lib/formulary-pricing";
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

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/glp[-\s]?1s?/gi, "glp1")
    .replace(/glp[-\s]?2t?/gi, "glp2")
    .replace(/tirzepatide|trizapatide/gi, "glp2")
    .replace(/semaglutide/gi, "glp1")
    .replace(/retatrutide/gi, "glp3")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string) {
  return new Set(norm(s).split(" ").filter((t) => t.length > 2));
}

function overlapScore(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.max(ta.size, tb.size);
}

async function fetchPublicPrices() {
  const map = new Map<string, number>(); // id or name: → wholesale cents
  const key = process.env.VITARELAY_API_KEY || process.env.EVENTIDE_API_KEY || "";
  if (!key) return map;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  if (process.env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;

  for (let page = 1; page <= 40; page += 1) {
    const res = await fetch(`https://vitarelay.com/api/public/v1/catalog?limit=100&page=${page}`, {
      headers,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id?: string; name?: string; price_cents?: number }>;
    };
    const rows = Array.isArray(json.data) ? json.data : [];
    if (!rows.length) break;
    for (const row of rows) {
      if (!row.id || typeof row.price_cents !== "number") continue;
      map.set(row.id, row.price_cents);
      map.set(`name:${norm(row.name || "")}`, row.price_cents);
    }
    if (rows.length < 100) break;
  }
  return map;
}

function loadLocalFormularyPrices() {
  const path = resolve(process.cwd(), "data/eventide-formulary.json");
  const rows = JSON.parse(readFileSync(path, "utf8")) as Array<{
    sku?: string;
    medication?: string;
    name?: string;
    strength?: string;
    size?: string;
    price?: number;
  }>;
  const byName = new Map<string, number>(); // name key → wholesale dollars
  const list: Array<{ key: string; label: string; dollars: number }> = [];
  for (const row of rows) {
    if (row.price == null || !Number.isFinite(Number(row.price))) continue;
    const label = [row.medication || row.name, row.strength, row.size].filter(Boolean).join(" ");
    const key = norm(label);
    const med = norm(row.medication || row.name || "");
    byName.set(key, Number(row.price));
    if (med) byName.set(`med:${med}`, Number(row.price));
    if (row.sku) byName.set(`sku:${String(row.sku).toLowerCase()}`, Number(row.price));
    list.push({ key, label, dollars: Number(row.price) });
  }
  return { byName, list };
}

async function main() {
  const publicPrices = await fetchPublicPrices();
  const local = loadLocalFormularyPrices();

  // 1) PrescribeUSA — exact sheet prices
  let pusa = 0;
  for (const line of prescribeUsaPensCatalog) {
    await prisma.product.updateMany({
      where: { sku: line.sku },
      data: {
        priceCents: line.priceCents,
        category: line.category.startsWith("PrescribeUSA") ? line.category : `PrescribeUSA · ${line.category}`,
        active: true,
        orderable: true,
      },
    });
    pusa += 1;
  }

  const eventide = await prisma.product.findMany({
    where: {
      active: true,
      OR: [{ category: { startsWith: "Eventide" } }, { productClass: { in: ["503A", "503B", "RND"] } }],
    },
    select: { id: true, sku: true, name: true, category: true, priceCents: true, description: true },
  });

  let fromApi = 0;
  let fromLocalExact = 0;
  let fromLocalFuzzy = 0;
  let fromCategoryMedian = 0;
  let unchanged = 0;

  // Collect priced wholesale cents by Eventide category for median fallback
  const categoryWholesale: Record<string, number[]> = {};

  type Planned = { id: string; priceCents: number; source: string; category: string };
  const planned: Planned[] = [];

  for (const product of eventide) {
    const nameKey = `name:${norm(product.name)}`;
    let wholesaleCents: number | null = null;
    let source = "";

    if (publicPrices.has(product.sku)) {
      wholesaleCents = publicPrices.get(product.sku)!;
      source = "vitarelay_public";
    } else if (publicPrices.has(nameKey)) {
      wholesaleCents = publicPrices.get(nameKey)!;
      source = "vitarelay_public_name";
    } else {
      // local formulary exact / medication contains
      const exact = local.byName.get(norm(product.name));
      if (exact != null) {
        wholesaleCents = Math.round(exact * 100);
        source = "local_formulary";
      } else {
        let best = 0;
        let bestDollars = 0;
        for (const row of local.list) {
          const score = overlapScore(product.name, row.label);
          if (score > best) {
            best = score;
            bestDollars = row.dollars;
          }
        }
        if (best >= 0.55) {
          wholesaleCents = Math.round(bestDollars * 100);
          source = `local_fuzzy_${best.toFixed(2)}`;
        }
      }
    }

    if (wholesaleCents != null && wholesaleCents > 0) {
      const sell = Math.round(wholesaleCents * WT_FORMULARY_MARKUP);
      planned.push({ id: product.id, priceCents: sell, source, category: product.category });
      const cat = product.category || "Eventide";
      (categoryWholesale[cat] ||= []).push(wholesaleCents);
      if (source.startsWith("vitarelay")) fromApi += 1;
      else if (source === "local_formulary") fromLocalExact += 1;
      else fromLocalFuzzy += 1;
    }
  }

  // Category median fallback for still-unpriced Eventide rows
  const medians = new Map<string, number>();
  for (const [cat, vals] of Object.entries(categoryWholesale)) {
    const sorted = [...vals].sort((a, b) => a - b);
    medians.set(cat, sorted[Math.floor(sorted.length / 2)] || 0);
  }
  // Global median across all known wholesale
  const allWholesale = Object.values(categoryWholesale).flat().sort((a, b) => a - b);
  const globalMedian = allWholesale[Math.floor(allWholesale.length / 2)] || 4500; // $45 default if empty

  const pricedIds = new Set(planned.map((p) => p.id));
  for (const product of eventide) {
    if (pricedIds.has(product.id)) continue;
    if (product.priceCents > 0) {
      unchanged += 1;
      continue;
    }
    const wholesale = medians.get(product.category) || globalMedian;
    const sell = Math.round(wholesale * WT_FORMULARY_MARKUP);
    planned.push({
      id: product.id,
      priceCents: sell,
      source: "category_median_estimate",
      category: product.category,
    });
    fromCategoryMedian += 1;
  }

  let updated = 0;
  for (const row of planned) {
    const before = eventide.find((p) => p.id === row.id);
    const note =
      row.source === "category_median_estimate"
        ? "Price estimated from category median until Eventide attaches a practice price list."
        : "";
    await prisma.product.update({
      where: { id: row.id },
      data: {
        priceCents: row.priceCents,
        ...(note && before && !before.description.includes("Price estimated")
          ? { description: `${before.description || before.name} · ${note}`.slice(0, 1900) }
          : {}),
      },
    });
    updated += 1;
  }

  const eventideZero = await prisma.product.count({
    where: { active: true, category: { startsWith: "Eventide" }, priceCents: 0 },
  });
  const eventidePriced = await prisma.product.count({
    where: { active: true, category: { startsWith: "Eventide" }, priceCents: { gt: 0 } },
  });
  const pusaZero = await prisma.product.count({
    where: { category: { startsWith: "PrescribeUSA" }, priceCents: 0 },
  });
  const pusaPriced = await prisma.product.count({
    where: { category: { startsWith: "PrescribeUSA" }, priceCents: { gt: 0 } },
  });

  console.log(
    JSON.stringify(
      {
        markup: WT_FORMULARY_MARKUP,
        prescribeUsaRows: pusa,
        fromApi,
        fromLocalExact,
        fromLocalFuzzy,
        fromCategoryMedian,
        alreadyPricedSkipped: unchanged,
        updated,
        eventidePriced,
        eventideZero,
        pusaPriced,
        pusaZero,
        publicApiPrices: [...publicPrices.keys()].filter((k) => !k.startsWith("name:")).length,
        localFormularyRows: local.list.length,
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
