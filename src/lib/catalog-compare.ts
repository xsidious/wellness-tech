import { isPrescribeUsaProduct } from "@/lib/rules";

export type CatalogPeer = {
  peerVendor: "eventide" | "prescribeusa";
  peerPriceCents: number;
  peerSku: string;
  peerName: string;
  cheaper: "eventide" | "prescribeusa" | "tie";
};

export function normalizeCatalogKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/glp[-\s]?1s?\b/g, "glp1")
    .replace(/tirzepatide|glp[-\s]?2t?\b/g, "glp2")
    .replace(/retatrutide|glp[-\s]?3\b/g, "glp3")
    .replace(/semaglutide/g, "glp1")
    .replace(/foxo?[- ]?0?4/g, "fox04")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(name: string, strength?: string | null) {
  const base = normalizeCatalogKey(name);
  const strengthKey = normalizeCatalogKey(strength || "");
  // Prefer medication token + numeric strength tokens
  const tokens = base.split(" ").filter((t) => t.length > 1);
  const med = tokens.slice(0, 3).join(" ");
  const nums = (strengthKey.match(/\d+(?:\.\d+)?/g) || []).join(" ");
  return `${med}|${nums || strengthKey}`.trim();
}

type IndexRow = {
  sku: string;
  name: string;
  strength: string;
  priceCents: number;
  vendor: "eventide" | "prescribeusa";
  key: string;
};

export function buildCatalogCompareIndex(
  products: Array<{
    sku: string;
    name: string;
    strength?: string | null;
    priceCents?: number | null;
    category?: string | null;
    rxcoreFormularyId?: string | null;
  }>,
) {
  const eventide: IndexRow[] = [];
  const prescribeusa: IndexRow[] = [];
  for (const p of products) {
    if (!p.priceCents || p.priceCents <= 0) continue;
    const pusa = isPrescribeUsaProduct({
      sku: p.sku,
      category: p.category,
      rxcoreFormularyId: p.rxcoreFormularyId,
    });
    const row: IndexRow = {
      sku: p.sku,
      name: p.name,
      strength: p.strength || "",
      priceCents: p.priceCents,
      vendor: pusa ? "prescribeusa" : "eventide",
      key: fingerprint(p.name, p.strength),
    };
    if (pusa) prescribeusa.push(row);
    else eventide.push(row);
  }
  return { eventide, prescribeusa };
}

function bestPeer(source: IndexRow, candidates: IndexRow[]): IndexRow | null {
  const want = source.key;
  let best: { row: IndexRow; score: number } | null = null;
  for (const row of candidates) {
    if (row.sku === source.sku) continue;
    let score = 0;
    if (row.key === want) score = 100;
    else {
      const [medA, numA] = want.split("|");
      const [medB, numB] = row.key.split("|");
      if (medA && medB && (medA === medB || medA.includes(medB) || medB.includes(medA))) score += 50;
      if (numA && numB && numA === numB) score += 40;
      else if (numA && numB && (numA.includes(numB) || numB.includes(numA))) score += 15;
    }
    if (score < 70) continue;
    if (!best || score > best.score || (score === best.score && row.priceCents < best.row.priceCents)) {
      best = { row, score };
    }
  }
  return best?.row || null;
}

export function peerPriceForProduct(
  product: {
    sku: string;
    name: string;
    strength?: string | null;
    priceCents?: number | null;
    category?: string | null;
    rxcoreFormularyId?: string | null;
  },
  index: ReturnType<typeof buildCatalogCompareIndex>,
): CatalogPeer | null {
  const pusa = isPrescribeUsaProduct({
    sku: product.sku,
    category: product.category,
    rxcoreFormularyId: product.rxcoreFormularyId,
  });
  const source: IndexRow = {
    sku: product.sku,
    name: product.name,
    strength: product.strength || "",
    priceCents: product.priceCents || 0,
    vendor: pusa ? "prescribeusa" : "eventide",
    key: fingerprint(product.name, product.strength),
  };
  const peer = bestPeer(source, pusa ? index.eventide : index.prescribeusa);
  if (!peer || !source.priceCents) return null;
  const cheaper =
    peer.priceCents === source.priceCents
      ? "tie"
      : peer.priceCents < source.priceCents
        ? peer.vendor
        : source.vendor;
  return {
    peerVendor: peer.vendor,
    peerPriceCents: peer.priceCents,
    peerSku: peer.sku,
    peerName: peer.name,
    cheaper,
  };
}
