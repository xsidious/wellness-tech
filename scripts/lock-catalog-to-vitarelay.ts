/**
 * Make the WT marketplace Eventide-safe:
 * 1) Pull live VitaRelay practice catalog IDs
 * 2) Remap name-matched legacy SKUs onto VR UUIDs when possible
 * 3) Mark anything without a verified VR UUID as not orderable (except PrescribeUSA pens)
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

const prisma = new PrismaClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

function norm(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/glp[-\s]?1s?\b/g, "glp1")
    .replace(/glp[-\s]?2t?\b/g, "glp2")
    .replace(/glp[-\s]?3\b/g, "glp3")
    .replace(/foxo?[- ]?0?4/g, "fox04")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type VrRow = {
  id: string;
  name: string;
  slug?: string;
  strength?: string;
  size?: string;
  category?: string;
  form?: string;
  type?: string;
  priceCents?: number | null;
};

async function fetchVrCatalog(): Promise<VrRow[]> {
  const env = loadEnv();
  const key = env.EVENTIDE_API_KEY || env.VITARELAY_API_KEY || "";
  if (!key) throw new Error("Missing EVENTIDE_API_KEY / VITARELAY_API_KEY");
  const base = (
    env.EVENTIDE_API_BASE_URL ||
    env.VITARELAY_PRACTICE_API_BASE_URL ||
    "https://vitarelay.com/api/public/practice/v1"
  ).replace(/\/$/, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  if (env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = env.EVENTIDE_PLACED_BY_USER_ID;

  const all: VrRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const res = await fetch(`${base}/catalog?limit=100&page=${page}`, { headers });
    const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const rows = Array.isArray(body.data) ? body.data : [];
    if (!rows.length) break;
    for (const item of rows) {
      const id = String(item.id || "").trim();
      if (!UUID.test(id)) continue;
      all.push({
        id,
        name: String(item.name || ""),
        slug: item.slug ? String(item.slug) : undefined,
        strength: Array.isArray(item.strengths) ? String(item.strengths[0] || "") : undefined,
        size: item.volume ? String(item.volume) : undefined,
        category: item.category_label
          ? String(item.category_label)
          : item.category
            ? String(item.category)
            : undefined,
        form: item.dosage_form ? String(item.dosage_form) : undefined,
        type: item.type ? String(item.type) : undefined,
        priceCents: typeof item.price_cents === "number" ? item.price_cents : null,
      });
    }
    if (rows.length < 100) break;
  }
  return all;
}

function isPrescribeUsa(category: string, sku: string, formulary: string) {
  return (
    /^PrescribeUSA/i.test(category) ||
    /^PUSA-/i.test(sku) ||
    /^pusa-/i.test(formulary)
  );
}

function scoreMatch(productName: string, productStrength: string, vr: VrRow) {
  const want = norm(productName);
  const got = norm(vr.name);
  if (!want || !got) return 0;
  let score = 0;
  if (want === got) score += 120;
  if (want.includes(got) || got.includes(want)) score += 50;
  const wantTokens = new Set(want.split(" ").filter((t) => t.length > 2));
  const gotTokens = got.split(" ").filter((t) => t.length > 2);
  let overlap = 0;
  for (const t of gotTokens) if (wantTokens.has(t)) overlap += 1;
  score += overlap * 8;
  const strength = norm(productStrength || vr.strength || "");
  if (strength && (want.includes(strength) || got.includes(strength))) score += 20;
  // Require meaningful overlap so we don't ship wrong SKUs.
  if (overlap < 2 && want !== got && score < 100) return 0;
  return score;
}

async function main() {
  const vr = await fetchVrCatalog();
  const byId = new Map(vr.map((row) => [row.id, row]));
  console.log(JSON.stringify({ vrCount: vr.length }, null, 2));

  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      strength: true,
      size: true,
      category: true,
      rxcoreFormularyId: true,
      orderable: true,
      active: true,
      productClass: true,
      holdReason: true,
    },
  });

  let verified = 0;
  let remapped = 0;
  let blocked = 0;
  let prescribeKept = 0;
  let alreadyOk = 0;
  const remapSamples: Array<{ from: string; to: string; name: string; score: number }> = [];
  const blockedSamples: string[] = [];

  for (const product of products) {
    const formulary = product.rxcoreFormularyId || "";
    const prescribe = isPrescribeUsa(product.category, product.sku, formulary);

    // PrescribeUSA is a separate vendor — keep orderable, never pretend they are Eventide UUIDs.
    if (prescribe) {
      prescribeKept += 1;
      if (!product.orderable || !product.active) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            orderable: true,
            active: true,
            holdReason: "",
          },
        });
      }
      continue;
    }

    const skuUuid = UUID.test(product.sku) ? product.sku : "";
    const formUuid = UUID.test(formulary) ? formulary : "";
    const candidate = (formUuid && byId.has(formUuid) ? formUuid : "") || (skuUuid && byId.has(skuUuid) ? skuUuid : "");

    if (candidate) {
      verified += 1;
      const row = byId.get(candidate)!;
      const category = row.category?.startsWith("Eventide")
        ? row.category
        : `Eventide · ${row.category || "Compounded"}`;
      const needsFix =
        product.rxcoreFormularyId !== candidate ||
        !product.orderable ||
        !product.active ||
        product.holdReason ||
        !/^Eventide/i.test(product.category);
      if (needsFix) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            rxcoreFormularyId: candidate,
            orderable: true,
            active: true,
            holdReason: "",
            category,
          },
        });
      } else {
        alreadyOk += 1;
      }
      continue;
    }

    // Try name remap onto a VR UUID (legacy AA-FOX → FOX-04 DRI, etc.)
    let best: { row: VrRow; score: number } | null = null;
    for (const row of vr) {
      const score = scoreMatch(product.name, product.strength || "", row);
      if (!best || score > best.score) best = { row, score };
    }

    if (best && best.score >= 70 && byId.has(best.row.id)) {
      // Avoid colliding with an existing product that already owns this UUID sku.
      const existing = await prisma.product.findUnique({ where: { sku: best.row.id } });
      if (existing && existing.id !== product.id) {
        // Prefer the UUID-sku product; disable this legacy duplicate.
        await prisma.product.update({
          where: { id: product.id },
          data: {
            orderable: false,
            active: false,
            holdReason: `Duplicate of VitaRelay SKU ${best.row.id}. Use the Eventide catalog item.`,
          },
        });
        blocked += 1;
        if (blockedSamples.length < 25) blockedSamples.push(`${product.sku} → dup ${best.row.id}`);
        continue;
      }

      const category = best.row.category?.startsWith("Eventide")
        ? best.row.category
        : `Eventide · ${best.row.category || "Compounded"}`;

      // If legacy sku is not UUID, keep sku stable for cart history but stamp formulary UUID.
      await prisma.product.update({
        where: { id: product.id },
        data: {
          rxcoreFormularyId: best.row.id,
          orderable: true,
          active: true,
          holdReason: "",
          category,
          name: best.row.name || product.name,
        },
      });
      remapped += 1;
      if (remapSamples.length < 25) {
        remapSamples.push({
          from: product.sku,
          to: best.row.id,
          name: product.name,
          score: best.score,
        });
      }
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        active: false,
        orderable: false,
        holdReason: "Not in live VitaRelay/Eventide catalog — blocked to prevent wrong shipment.",
      },
    });
    blocked += 1;
    if (blockedSamples.length < 25) blockedSamples.push(`${product.sku} · ${product.name}`);
  }

  const orderable = await prisma.product.count({ where: { active: true, orderable: true } });
  const orderableUuid = await prisma.product.count({
    where: {
      active: true,
      orderable: true,
      OR: [
        { sku: { contains: "-" } },
      ],
    },
  });

  // Precise UUID orderable count
  const orderableRows = await prisma.product.findMany({
    where: { active: true, orderable: true },
    select: { sku: true, rxcoreFormularyId: true, category: true },
  });
  const eventideOrderable = orderableRows.filter(
    (p) => UUID.test(p.sku) || UUID.test(p.rxcoreFormularyId || ""),
  ).length;
  const prescribeOrderable = orderableRows.filter((p) =>
    isPrescribeUsa(p.category, p.sku, p.rxcoreFormularyId || ""),
  ).length;
  const unsafeOrderable = orderableRows.filter(
    (p) =>
      !UUID.test(p.sku) &&
      !UUID.test(p.rxcoreFormularyId || "") &&
      !isPrescribeUsa(p.category, p.sku, p.rxcoreFormularyId || ""),
  );

  console.log(
    JSON.stringify(
      {
        verified,
        remapped,
        blocked,
        prescribeKept,
        alreadyOk,
        orderable,
        eventideOrderable,
        prescribeOrderable,
        unsafeOrderable: unsafeOrderable.length,
        remapSamples,
        blockedSamples,
        unsafeSample: unsafeOrderable.slice(0, 10),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
