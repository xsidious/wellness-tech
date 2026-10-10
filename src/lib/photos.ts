export const photos = {
  hero: "/images/hero-clinic.jpg",
  consult: "/images/consult.jpg",
  weight: "/images/category-weight.jpg",
  peptides: "/images/category-peptides.jpg",
  exosomes: "/images/category-exosomes.jpg",
  equipment: "/images/category-equipment.jpg",
  supplies: "/images/category-supplies.jpg",
} as const;

const CATEGORY_SLUGS: Record<string, string> = {
  "appetite suppressant": "appetite-suppressant",
  "fat loss & metabolic": "fat-loss-metabolic",
  "fat loss and metabolic": "fat-loss-metabolic",
  "anti-aging": "anti-aging",
  "tissue repair & recovery": "tissue-repair",
  "tissue repair and recovery": "tissue-repair",
  longevity: "longevity",
  "sleep / circadian rhythm": "sleep",
  sleep: "sleep",
  "growth hormone optimization": "growth-hormone",
  "immune support": "immune",
  "cognitive & mood": "cognitive",
  "cognitive and mood": "cognitive",
  "hormone replacement therapy": "hrt",
  "sexual health": "sexual-health",
  dermatology: "dermatology",
  "skin & hair care": "skin-hair",
  "skin and hair care": "skin-hair",
  wellness: "wellness",
  peptides: "peptides",
  "peptide stacks": "peptides",
  addiction: "addiction",
  anesthetic: "anesthetic",
};

export function photoForCategory(category?: string | null) {
  const key = String(category || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // Peptides use the lab-vial photography set
  if (key === "peptides" || key === "peptide stacks") return photos.peptides;
  const slug = CATEGORY_SLUGS[key] || "compounded";
  return `/images/formulary/${slug}.svg`;
}

export function photoForClass(productClass: string, category?: string | null) {
  if (category) return photoForCategory(category);
  if (productClass === "503A" || productClass === "brand") return photoForCategory("appetite suppressant");
  if (productClass === "503B") return photoForCategory("peptides");
  if (productClass === "exosome") return photos.exosomes;
  if (productClass === "device") return photos.equipment;
  if (productClass === "supply") return photos.supplies;
  return photos.consult;
}
