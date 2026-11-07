import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import { partnerPriceCentsFromFormulary } from "@/lib/formulary-pricing";

export type PublicFormularyRow = {
  sku: string;
  medication: string;
  category: string;
  form: string;
  strength: string;
  size: string;
  /** Practice retail (formulary list price × markup), in cents. */
  priceCents: number;
};

function applyGlpNaming(text: string) {
  return String(text || "")
    .replace(/Trizapatide/gi, "GLP 2")
    .replace(/Tirzepatide/gi, "GLP 2")
    .replace(/Semaglutide/gi, "GLP 1")
    .replace(/Retatrutide/gi, "GLP 3")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function loadPublicFormulary(): PublicFormularyRow[] {
  const path = resolve(process.cwd(), "data/rxhere-formulary.json");
  if (!existsSync(path)) return [];
  const rows = JSON.parse(readFileSync(path, "utf8")) as {
    sku?: string;
    medication?: string;
    category?: string;
    form?: string;
    strength?: string;
    size?: string;
    price?: number;
  }[];
  return rows
    .map((row) => {
      const sku = String(row.sku || "").trim();
      if (!sku || !row.medication) return null;
      return {
        sku,
        medication: applyGlpNaming(row.medication),
        category: applyGlpNaming(row.category || "Compounded"),
        form: row.form || "",
        strength: row.strength || "",
        size: row.size || "",
        priceCents: partnerPriceCentsFromFormulary(row.price),
      };
    })
    .filter(Boolean) as PublicFormularyRow[];
}
