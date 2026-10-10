import { absoluteUrl, getAppUrl } from "@/lib/seo/metadata";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Wellness Tech Distribution",
    url: getAppUrl(),
    logo: absoluteUrl("/images/wellness-tech-logo.svg"),
    description:
      "Wholesale distribution of compounded therapies and aesthetic products for licensed medical practices.",
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Wellness Tech Distribution",
    url: getAppUrl(),
  };
}

export function professionalServiceJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${getAppUrl()}/#business`,
    name: "Wellness Tech Distribution",
    url: getAppUrl(),
    image: absoluteUrl("/images/hero-clinic.jpg"),
    description:
      "503A and 503B compounded therapies, peptides, GLP-1s, exosomes, and clinical supplies for licensed practices.",
    areaServed: { "@type": "Country", name: "United States" },
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Licensed healthcare practices",
    },
  };
}
