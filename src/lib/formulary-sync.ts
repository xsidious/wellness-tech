import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { probeFormularyCatalog } from "@/lib/eventide";
import { partnerPriceCentsFromFormulary, WT_FORMULARY_MARKUP } from "@/lib/formulary-pricing";

export { partnerPriceCentsFromFormulary, WT_FORMULARY_MARKUP };

export type FormularyRow = {
  sku: string;
  medication?: string;
  name?: string;
  category?: string;
  form?: string;
  strength?: string;
  size?: string;
  total?: string;
  price?: number;
  description?: string;
  productClass?: string;
  controlledSubstance?: boolean;
  slug?: string;
  requiresPrescription?: boolean;
  imageUrl?: string;
};

function applyGlpNaming(text: string) {
  return String(text || "")
    .replace(/Trizapatide/gi, "GLP 2")
    .replace(/Tirzepatide/gi, "GLP 2")
    .replace(/Semaglutide/gi, "GLP 1")
    .replace(/Retatrutide/gi, "GLP 3")
    .replace(/GLP-2T\s+GLP 2/gi, "GLP-2T")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeProductClass(raw?: string | null) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "503b" || v === "503B") return "503B";
  if (v === "rnd" || v === "r&d" || v === "ruo") return "RND";
  return "503A";
}

function buildName(row: FormularyRow) {
  const med = applyGlpNaming(row.medication || row.name || row.sku);
  const parts = [med];
  if (row.strength) parts.push(row.strength);
  if (row.size) parts.push(`(${row.size})`);
  if (row.total) parts.push(`· ${row.total}`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function loadLocalFormulary(): FormularyRow[] {
  const path = resolve(process.cwd(), "data/eventide-formulary.json");
  if (!existsSync(path)) return [];
  const rows = JSON.parse(readFileSync(path, "utf8")) as FormularyRow[];
  return Array.isArray(rows) && rows.length ? rows : [];
}

function fillMissingPricesFromLocal(rows: FormularyRow[]): FormularyRow[] {
  const local = loadLocalFormulary();
  if (!local.length) return rows;

  function norm(s: string) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const byMed = new Map<string, number>();
  for (const row of local) {
    if (row.price == null || !Number.isFinite(Number(row.price))) continue;
    const med = norm(row.medication || row.name || "");
    if (med) byMed.set(med, Number(row.price));
    const full = norm([row.medication || row.name, row.strength, row.size].filter(Boolean).join(" "));
    if (full) byMed.set(full, Number(row.price));
  }

  return rows.map((row) => {
    if (row.price != null && Number(row.price) > 0) return row;
    const med = norm(row.medication || row.name || "");
    const hit = byMed.get(med) ?? byMed.get(norm(row.name || ""));
    if (hit == null) return row;
    return { ...row, price: hit };
  });
}

export async function loadFormularyRows(): Promise<{ source: "api" | "json"; rows: FormularyRow[] }> {
  const probed = await probeFormularyCatalog();
  if (probed?.length) {
    const rows = fillMissingPricesFromLocal(
      probed.map((row) => ({
        sku: row.sku,
        medication: row.medication || row.name,
        name: row.name,
        category: row.category,
        form: row.form,
        strength: row.strength,
        size: row.size,
        price: row.price,
        description: row.description,
        productClass: row.productClass,
        controlledSubstance: row.controlledSubstance,
        slug: row.slug,
        requiresPrescription: row.requiresPrescription,
        imageUrl: row.imageUrl,
      })),
    );
    return { source: "api", rows };
  }
  return { source: "json", rows: loadLocalFormulary() };
}

/** Upsert VitaRelay Practice API formulary into the practice catalog. */
export async function syncEventideFormulary(actorId = "") {
  const { source, rows } = await loadFormularyRows();
  if (!rows.length) {
    return { ok: false as const, error: "No formulary rows found from the API or local JSON." };
  }

  const syncedAt = new Date();
  let upserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const sku = String(row.sku || "").trim();
    if (!sku) {
      skipped += 1;
      continue;
    }
    // Never overwrite PrescribeUSA (or other non-Eventide) SKUs from Eventide sync.
    if (/^PUSA-/i.test(sku) || /^pusa-/i.test(sku)) {
      skipped += 1;
      continue;
    }
    const name = buildName(row);
    const rawCategory = applyGlpNaming(row.category || "Compounded");
    const category = rawCategory.startsWith("Eventide")
      ? rawCategory
      : `Eventide · ${rawCategory}`;
    const form = row.form || "";
    const strength = row.strength || "";
    const size = row.size || "";
    const productClass = normalizeProductClass(row.productClass);
    const controlledSubstance = Boolean(row.controlledSubstance);
    const slug = String(row.slug || "").trim();
    const imageUrl = String(row.imageUrl || "").trim();
    // Skip section-header rows (no medication / price) on local JSON fallbacks.
    if (source === "json" && (!(row.medication || row.name) || row.price == null || !Number.isFinite(Number(row.price)))) {
      skipped += 1;
      continue;
    }
    if (!(row.medication || row.name)) {
      skipped += 1;
      continue;
    }

    const priceCents =
      row.price != null && Number.isFinite(Number(row.price))
        ? partnerPriceCentsFromFormulary(row.price)
        : 0;
    const rxRequired =
      row.requiresPrescription != null ? Boolean(row.requiresPrescription) : productClass !== "RND";
    const description = [
      row.description ? applyGlpNaming(row.description) : "",
      form ? `Form: ${form}` : "",
      strength ? `Strength: ${strength}` : "",
      size ? `Size: ${size}` : "",
      productClass ? `Class: ${productClass}` : "",
      controlledSubstance ? "Controlled substance" : "",
      `SKU: ${sku}`,
      priceCents ? `Practice price: $${(priceCents / 100).toFixed(2)}` : "",
      "Vendor: Eventide · VitaRelay Practice API · pharmacy fulfillment.",
    ]
      .filter(Boolean)
      .join(" · ");

    // Only accept VitaRelay platform UUIDs for Eventide orderable catalog rows.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sku);
    if (source === "api" && !isUuid) {
      skipped += 1;
      continue;
    }

    await prisma.product.upsert({
      where: { sku },
      create: {
        sku,
        rxcoreFormularyId: sku,
        name,
        productClass,
        category,
        form,
        strength,
        size,
        slug,
        storage: /inj|solution|vial/i.test(`${form} ${name}`) ? "cold" : "ambient",
        rxRequired,
        controlledSubstance,
        priceCents,
        orderable: isUuid,
        active: true,
        holdReason: isUuid ? "" : "Not a VitaRelay platform product id.",
        description,
        ...(imageUrl ? { imageUrl } : {}),
        lastSyncedAt: syncedAt,
      },
      update: {
        rxcoreFormularyId: sku,
        name,
        productClass,
        category,
        form,
        strength,
        size,
        slug,
        rxRequired,
        controlledSubstance,
        ...(priceCents > 0 ? { priceCents } : {}),
        orderable: isUuid,
        active: true,
        holdReason: isUuid ? "" : "Not a VitaRelay platform product id.",
        description,
        ...(imageUrl ? { imageUrl } : {}),
        lastSyncedAt: syncedAt,
      },
    });
    upserted += 1;
  }

  let blockedLegacy = 0;
  if (source === "api") {
    blockedLegacy = await blockLegacyNonEventideProducts();
  }

  await audit({
    actorId,
    action: "catalog.vitarelay_sync",
    object: "formulary",
    after: `${source}:${upserted};blocked:${blockedLegacy}`,
  });

  return { ok: true as const, source, upserted, skipped, blockedLegacy, total: rows.length, syncedAt };
}

/** @deprecated use syncEventideFormulary */

/** Disable legacy local-formulary SKUs that are not VitaRelay UUIDs (keeps PrescribeUSA). */
export async function blockLegacyNonEventideProducts() {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, sku: true, category: true, rxcoreFormularyId: true, orderable: true },
  });
  let blocked = 0;
  for (const product of products) {
    if (
      /^PrescribeUSA/i.test(product.category) ||
      /^PUSA-/i.test(product.sku) ||
      /^pusa-/i.test(product.rxcoreFormularyId || "")
    ) {
      continue;
    }
    if (UUID.test(product.sku) || UUID.test(product.rxcoreFormularyId || "")) continue;
    if (!product.orderable) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        active: false,
        orderable: false,
        holdReason: "Not in live VitaRelay/Eventide catalog — blocked to prevent wrong shipment.",
      },
    });
    blocked += 1;
  }
  return blocked;
}

export type PrescribeUsaImportRow = {
  sheetId?: string;
  sku: string;
  name: string;
  category: string;
  subcategory?: string;
  rxRequired?: boolean;
  form?: string;
  deliveryMethod?: string;
  strength?: string;
  size?: string;
  storage?: string;
  wholesaleDollars?: number;
  priceCents?: number;
  description?: string;
};

function loadPrescribeUsaRows(): PrescribeUsaImportRow[] {
  const candidates = [
    resolve(process.cwd(), "data/pusa-products.json"),
    resolve(process.cwd(), "../wellness-tech/data/pusa-products.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      products?: PrescribeUsaImportRow[];
    };
    if (Array.isArray(raw.products) && raw.products.length) return raw.products;
  }
  // Fallback: legacy pens list if JSON snapshot missing.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prescribeUsaPensCatalog } = require("@/lib/prescribeusa-pens-catalog") as {
      prescribeUsaPensCatalog: Array<{
        sku: string;
        name: string;
        category: string;
        size: string;
        strength: string;
        priceCents: number;
        description: string;
      }>;
    };
    return prescribeUsaPensCatalog.map((line) => ({
      sku: line.sku,
      name: line.name,
      category: line.category.replace(/^PrescribeUSA(?:\s*Pens)?(?:\s*·\s*)?/i, "") || "Pens",
      form: "Pre-Filled Injectable Pen",
      strength: line.strength,
      size: line.size,
      storage: "Refrigerated",
      priceCents: line.priceCents,
      description: line.description,
      rxRequired: true,
    }));
  } catch {
    return [];
  }
}

function pusaImageForForm(form: string) {
  const f = form.toLowerCase();
  if (/pen/.test(f)) {
    return "https://vitarelay.com/__l5e/assets-v1/7a5eff76-3f46-4d87-8a50-de34ef7f27ff/injection-pen.png";
  }
  if (/inj|vial|lyoph|solution/.test(f)) {
    return "https://vitarelay.com/__l5e/assets-v1/0cffe580-da37-48f8-b0d1-5a07027e056b/lyophilized-powder.png";
  }
  return "https://vitarelay.com/__l5e/assets-v1/93425fa8-8402-43ab-ba6b-edf2329a9d39/serum-bottle.png";
}

function pusaStorage(raw: string) {
  const s = raw.toLowerCase();
  if (/refrig|cold|2.?8/.test(s)) return "cold";
  return "ambient";
}

/** Upsert PrescribeUSA catalog (sheet snapshot) into practice products — separate from Eventide. */
export async function syncPrescribeUsaCatalog(actorId = "") {
  const rows = loadPrescribeUsaRows();
  if (!rows.length) {
    return { ok: false as const, error: "No PrescribeUSA rows found in data/pusa-products.json." };
  }
  const syncedAt = new Date();
  let upserted = 0;
  let skipped = 0;

  for (const line of rows) {
    const sku = String(line.sku || "").trim();
    if (!sku || !/^PUSA-/i.test(sku)) {
      skipped += 1;
      continue;
    }
    const name = applyGlpNaming(line.name || sku);
    if (!name) {
      skipped += 1;
      continue;
    }
    const rawCategory = applyGlpNaming(line.category || "General");
    const category = rawCategory.startsWith("PrescribeUSA")
      ? rawCategory
      : `PrescribeUSA · ${rawCategory}`;
    const form = line.form || line.deliveryMethod || "Compound";
    const strength = line.strength || "";
    const size = line.size || "";
    const priceCents =
      line.priceCents != null && Number.isFinite(Number(line.priceCents))
        ? Math.round(Number(line.priceCents))
        : partnerPriceCentsFromFormulary(line.wholesaleDollars ?? 0);
    const rxRequired = line.rxRequired != null ? Boolean(line.rxRequired) : true;
    const imageUrl = pusaImageForForm(form);
    const description = [
      line.description || "",
      line.subcategory ? `Subcategory: ${line.subcategory}` : "",
      form ? `Form: ${form}` : "",
      strength ? `Strength: ${strength}` : "",
      size ? `Size: ${size}` : "",
      line.sheetId ? `PUSA id: ${line.sheetId}` : "",
      `SKU: ${sku}`,
      priceCents ? `Practice price: $${(priceCents / 100).toFixed(2)}` : "",
      "Vendor: PrescribeUSA · separate from Eventide/VitaRelay fulfillment.",
    ]
      .filter(Boolean)
      .join(" · ");

    await prisma.product.upsert({
      where: { sku },
      create: {
        sku,
        rxcoreFormularyId: `pusa-${sku.toLowerCase()}`,
        name,
        productClass: "503A",
        category,
        form,
        strength,
        size,
        storage: pusaStorage(line.storage || ""),
        rxRequired,
        controlledSubstance: false,
        priceCents,
        orderable: true,
        active: true,
        holdReason: "",
        description,
        imageUrl,
        lastSyncedAt: syncedAt,
      },
      update: {
        name,
        productClass: "503A",
        category,
        form,
        strength,
        size,
        storage: pusaStorage(line.storage || ""),
        rxRequired,
        ...(priceCents > 0 ? { priceCents } : {}),
        orderable: true,
        active: true,
        holdReason: "",
        description,
        imageUrl,
        lastSyncedAt: syncedAt,
      },
    });
    upserted += 1;
  }

  await audit({
    actorId,
    action: "catalog.prescribeusa_sync",
    object: "formulary",
    after: String(upserted),
  });

  return { ok: true as const, source: "prescribeusa" as const, upserted, skipped, total: rows.length, syncedAt };
}
