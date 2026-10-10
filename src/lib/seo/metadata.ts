import type { Metadata } from "next";

type SeoInput = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  noIndex?: boolean;
  type?: "website" | "article";
};

const siteName = "Wellness Tech Distribution";
const defaultTitle = "503A & 503B Therapies for Licensed Practices";
const defaultDescription =
  "Compounded peptides, GLP-1s, exosomes, and clinical supplies for licensed practices — one account, one cart, RxHere fulfillment.";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.thewellnesstech.com";
const defaultImage = "/images/hero-clinic.jpg";

export function getAppUrl() {
  return appUrl.replace(/\/$/, "");
}

export function absoluteUrl(path = "/") {
  if (path.startsWith("http")) return path;
  return `${getAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function displayTitle(rawTitle: string) {
  if (rawTitle.includes(siteName) || rawTitle.includes("Wellness Tech")) return rawTitle;
  return `${rawTitle} | ${siteName}`;
}

export function buildSeoMetadata(input: SeoInput = {}): Metadata {
  const rawTitle = input.title ?? defaultTitle;
  const title = displayTitle(rawTitle);
  const description = input.description ?? defaultDescription;
  const canonicalPath = input.canonicalPath ?? "/";
  const canonical = absoluteUrl(canonicalPath);
  const image = absoluteUrl(input.image ?? defaultImage);
  const noIndex = Boolean(input.noIndex);

  return {
    title: { absolute: title },
    description,
    metadataBase: (() => { try { return new URL(getAppUrl()); } catch { return new URL("https://www.thewellnesstech.com"); } })(),
    alternates: { canonical: canonicalPath },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: { index: !noIndex, follow: !noIndex },
    },
    openGraph: {
      type: input.type ?? "website",
      siteName,
      locale: "en_US",
      title,
      description,
      url: canonical,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
