import type { Metadata } from "next";
import "./globals.css";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { organizationJsonLd, professionalServiceJsonLd, websiteJsonLd } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildSeoMetadata({
    title: "503A and 503B Therapies for Licensed Practices",
    description:
      "Compounded peptides, GLP-1s, exosomes, and clinical supplies for licensed practices - one account, one cart, RxHere fulfillment.",
    canonicalPath: "/",
  }),
  icons: {
    icon: [{ url: "/images/wellness-tech-logo.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <JsonLd data={[organizationJsonLd(), websiteJsonLd(), professionalServiceJsonLd()]} />
        {children}
      </body>
    </html>
  );
}
