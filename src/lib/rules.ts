export const PRODUCT_CLASSES = [
  "503A",
  "503B",
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

export function canOrder(
  tier: number,
  productClass: ProductClass,
  orderable = true,
  opts?: { hasVerifiedPrescriber?: boolean },
) {
  if (productClass === "exosome") {
    return {
      ok: false,
      reason: "Exosome products stay off checkout until compliance confirms labeling and intended use.",
    };
  }
  if (productClass === "bulk_api") {
    return {
      ok: false,
      reason: "Bulk API buyer rules are waiting on compliance sign-off.",
    };
  }
  if (!orderable) {
    return { ok: false, reason: "This SKU is not available to order." };
  }
  if ((productClass === "503A" || productClass === "503B") && opts?.hasVerifiedPrescriber === false) {
    return {
      ok: false,
      reason: "A verified NPI credential is required before ordering 503A/503B compounds.",
    };
  }
  if (productClass === "503B") {
    if (tier < 2) {
      return { ok: false, reason: "A Tier 1 account cannot check out 503B office-use stock." };
    }
    return { ok: true as const };
  }
  if (tier < 1) {
    return { ok: false, reason: "Tier 1 (NPI and an attested active license) is required before checkout." };
  }
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
  if (classes.includes("brand")) groups.push("Brand");
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
