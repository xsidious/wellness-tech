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
      })),
    };
  }
  return { source: "json", rows: loadLocalFormulary() };
}

/** Upsert formulary into the practice catalog (fulfillment partner stays internal). */
export async function syncRxHereFormulary(actorId = "") {
  const { source, rows } = await loadFormularyRows();
  if (!rows.length) {
    return { ok: false as const, error: "No formulary rows found from the API or local JSON." };
  }

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
    // Skip section-header rows (no medication / price).
    if (!(row.medication || row.name) || row.price == null || !Number.isFinite(Number(row.price))) {
      skipped += 1;
      continue;
    }

    const priceCents = partnerPriceCentsFromFormulary(row.price);
    const description = [
      row.description ? applyGlpNaming(row.description) : "",
      form ? `Form: ${form}` : "",
      strength ? `Strength: ${strength}` : "",
      size ? `Size: ${size}` : "",
      `SKU: ${sku}`,
      priceCents ? `Practice price: $${(priceCents / 100).toFixed(2)}` : "",
      "503A compounded · pharmacy fulfillment.",
    ]
      .filter(Boolean)
      .join(" · ");

    await prisma.product.upsert({
      where: { sku },
      create: {
        sku,
        rxcoreFormularyId: sku,
        name,
        productClass: "503A",
        category,
        form,
        strength,
        size,
        storage: /inj|solution|vial/i.test(`${form} ${name}`) ? "cold" : "ambient",
        rxRequired: true,
        priceCents,
        orderable: true,
        active: true,
        holdReason: "",
        description,
      },
      update: {
        rxcoreFormularyId: sku,
        name,
        productClass: "503A",
        category,
        form,
        strength,
        size,
        rxRequired: true,
        priceCents,
        orderable: true,
        active: true,
        holdReason: "",
        description,
      },
    });
    upserted += 1;
  }

  await audit({
    actorId,
    action: "catalog.rxhere_sync",
    object: "formulary",
    after: `${source}:${upserted}`,
  });

  return { ok: true as const, source, upserted, skipped, total: rows.length };
}
