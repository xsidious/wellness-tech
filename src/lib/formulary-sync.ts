import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { probeFormularyCatalog } from "@/lib/rxhere";
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
  const candidates = [
    resolve(process.cwd(), "data/rxhere-formulary.json"),
    resolve(process.cwd(), "../kianprive/scripts/data/rxhere-formulary.json"),
    resolve("C:/Users/FindMeAnywhere/Desktop/kianprive/scripts/data/rxhere-formulary.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const rows = JSON.parse(readFileSync(path, "utf8")) as FormularyRow[];
    if (Array.isArray(rows) && rows.length) return rows;
  }
  return [];
}

export async function loadFormularyRows(): Promise<{ source: "api" | "json"; rows: FormularyRow[] }> {
  const probed = await probeFormularyCatalog();
  if (probed?.length) {
    return {
      source: "api",
      rows: probed.map((row) => ({
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
      })),
    };
  }
  return { source: "json", rows: loadLocalFormulary() };
}

/** Upsert VitaRelay Practice API formulary into the practice catalog. */
export async function syncRxHereFormulary(actorId = "") {
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
    const name = buildName(row);
    const category = applyGlpNaming(row.category || "Compounded");
    const form = row.form || "";
    const strength = row.strength || "";
    const size = row.size || "";
    const productClass = normalizeProductClass(row.productClass);
    const controlledSubstance = Boolean(row.controlledSubstance);
    const slug = String(row.slug || "").trim();
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
      "VitaRelay Practice API · pharmacy fulfillment.",
    ]
      .filter(Boolean)
      .join(" · ");

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
        orderable: true,
        active: true,
        holdReason: "",
        description,
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
        orderable: true,
        active: true,
        holdReason: "",
        description,
        lastSyncedAt: syncedAt,
      },
    });
    upserted += 1;
  }

  await audit({
    actorId,
    action: "catalog.vitarelay_sync",
    object: "formulary",
    after: `${source}:${upserted}`,
  });

  return { ok: true as const, source, upserted, skipped, total: rows.length, syncedAt };
}
