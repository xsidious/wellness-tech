export const photos = {
  hero: "/images/hero-clinic.jpg",
  consult: "/images/consult.jpg",
  weight: "/images/category-weight.jpg",
  peptides: "/images/category-peptides.jpg",
  exosomes: "/images/category-exosomes.jpg",
  equipment: "/images/category-equipment.jpg",
  celexoPro: "/images/celexo-pro.png",
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
  const raw = String(category || "")
    .replace(/^Eventide\s*·\s*/i, "")
    .replace(/^PrescribeUSA(?:\s*Pens)?(?:\s*·\s*)?/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // Peptides use the lab-vial photography set
  if (raw === "peptides" || raw === "peptide stacks") return photos.peptides;
  if (/weight|metabolic|glp|appetite/.test(raw)) return `/images/formulary/appetite-suppressant.svg`;
  if (/hormone/.test(raw)) return `/images/formulary/hrt.svg`;
  if (/cognitive|mood/.test(raw)) return `/images/formulary/cognitive.svg`;
  if (/beauty|skin|hair/.test(raw)) return `/images/formulary/skin-hair.svg`;
  if (/sexual/.test(raw)) return `/images/formulary/sexual-health.svg`;
  if (/sleep|stress/.test(raw)) return `/images/formulary/sleep.svg`;
  if (/immune|inflammation/.test(raw)) return `/images/formulary/immune.svg`;
  if (/longevity|cellular/.test(raw)) return `/images/formulary/longevity.svg`;
  if (/performance|energy|nutrient|peptide/.test(raw)) return photos.peptides;
  if (/pain|joint|injury|tissue/.test(raw)) return `/images/formulary/tissue-repair.svg`;
  if (/medical supplies|supply/.test(raw)) return photos.supplies;
  if (/general wellness|wellness/.test(raw)) return `/images/formulary/wellness.svg`;
  const slug = CATEGORY_SLUGS[raw] || "compounded";
  return `/images/formulary/${slug}.svg`;
}

export function photoForClass(productClass: string, category?: string | null) {
  if (category) return photoForCategory(category);
  if (productClass === "503A" || productClass === "brand") return photoForCategory("appetite suppressant");
  if (productClass === "503B" || productClass === "RND") return photoForCategory("peptides");
  if (productClass === "exosome") return photos.exosomes;
  if (productClass === "device") return photos.equipment;
  if (productClass === "supply") return photos.supplies;
  return photos.consult;
}
