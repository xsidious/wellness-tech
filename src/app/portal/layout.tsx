import type { Metadata } from "next";
import { PortalFrame } from "@/components/PortalFrame";
import { requireUser } from "@/lib/guard";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Practice Portal",
  description: "Wellness Tech Distribution practice portal.",
  canonicalPath: "/portal",
  noIndex: true,
});

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <PortalFrame user={user}>{children}</PortalFrame>;
}
