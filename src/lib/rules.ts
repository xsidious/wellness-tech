export const PRODUCT_CLASSES = [
  "503A",
  "503B",
  "RND",
  "brand",
  "exosome",
  "device",
  "supply",
  "bulk_api",
] as const;

export type ProductClass = (typeof PRODUCT_CLASSES)[number];

export function isProductClass(value: string): value is ProductClass {
  return (PRODUCT_CLASSES as readonly string[]).includes(value);
}

/** 503A patient compounds and 503B Rx-class lines require a signed eScript before pharmacy forward. */
export function requiresEscript(productClass: string, rxRequired = false) {
  if (productClass === "503A") return true;
  if (productClass === "503B" && rxRequired) return true;
  return false;
}

/** Office-use / PUO SKUs can ship without a patient script. */
export function isOfficeUseClass(productClass: string, officeUse = false) {
  if (officeUse) return true;
  return productClass === "device" || productClass === "supply" || productClass === "brand";
}

const VITARELAY_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PrescribeUSA pens are a separate vendor — not placed through VitaRelay. */
export function isPrescribeUsaProduct(input: {
  sku?: string | null;
  category?: string | null;
  rxcoreFormularyId?: string | null;
}) {
  return (
    /^PrescribeUSA/i.test(String(input.category || "")) ||
    /^PUSA-/i.test(String(input.sku || "")) ||
    /^pusa-/i.test(String(input.rxcoreFormularyId || ""))
  );
}

/** Eventide fulfillment requires a VitaRelay platform product UUID. */
export function hasVitaRelayCatalogMatch(input: {
  sku?: string | null;
  category?: string | null;
  rxcoreFormularyId?: string | null;
}) {
  if (isPrescribeUsaProduct(input)) return true;
  return VITARELAY_UUID.test(String(input.sku || "")) || VITARELAY_UUID.test(String(input.rxcoreFormularyId || ""));
}

export function canOrder(
  _tier: number,
  _productClass: ProductClass | string,
  orderable = true,
  opts?: {
    hasVerifiedPrescriber?: boolean;
    sku?: string | null;
    category?: string | null;
    rxcoreFormularyId?: string | null;
  },
) {
  // Marketplace: every orderable catalog SKU can be added to cart.
  // eScript / NPI checks still run at checkout for Rx lines.
  if (!orderable) {
    return { ok: false, reason: "This SKU is not available to order." };
  }
  if (
    opts &&
    (opts.sku != null || opts.rxcoreFormularyId != null || opts.category != null) &&
    !hasVitaRelayCatalogMatch({
      sku: opts.sku,
      category: opts.category,
      rxcoreFormularyId: opts.rxcoreFormularyId,
    })
  ) {
    return {
      ok: false,
      reason: "Not linked to the live VitaRelay/Eventide catalog — blocked to prevent wrong shipment.",
    };
  }
  return { ok: true as const };
}

/** Admin order desk — every active SKU is available, including held classes. */
export function canAdminOrder(active: boolean) {
  if (!active) return { ok: false as const, reason: "Inactive SKU." };
  return { ok: true as const };
}

export function commissionEligible(productClass: ProductClass) {
  return productClass === "device" || productClass === "supply";
}

export function commissionCents(productClass: ProductClass, lineCents: number) {
  if (!commissionEligible(productClass)) return 0;
  return Math.round(lineCents * 0.1);
}

export function fulfillmentGroups(classes: string[]) {
  const groups: string[] = [];
  if (classes.includes("503A")) groups.push("Patient-specific 503A");
  if (classes.includes("503B")) groups.push("Office-use 503B");
  if (classes.includes("RND")) groups.push("R&D / RUO");
  if (classes.includes("brand")) groups.push("Brand");
  if (classes.includes("exosome")) groups.push("Exosomes");
  if (classes.includes("device") || classes.includes("supply")) groups.push("Devices and supplies");
  const message =
    groups.length > 1
      ? `This checkout is split into ${groups.length} fulfillment groups (${groups.join(", ")}). You still receive one invoice.`
      : "";
  return { groups, message };
}

export function shippingCents(storages: string[]) {
  const cold = storages.some((item) => item.toLowerCase().includes("cold"));
  return cold ? 3500 : 1500;
}

export function routeSource(productClass: ProductClass) {
  if (productClass === "503A") return "503A compounding";
  if (productClass === "503B") return "Partner 503B";
  if (productClass === "RND") return "Eventide R&D";
  if (productClass === "brand") return "Licensed wholesaler";
  if (productClass === "device" || productClass === "supply") return "Network stock";
  return "Held";
}

export function tierLabel(tier: number) {
  if (tier <= 0) return "Tier 0 · Browse";
  if (tier === 1) return "Tier 1 · Prescriber";
  if (tier === 2) return "Tier 2 · Office use";
  if (tier === 3) return "Tier 3 · Controlled";
  return "Tier 4 · Bulk API";
}
