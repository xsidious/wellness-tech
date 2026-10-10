import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalFrame } from "@/components/PortalFrame";
import { currentUser, rolesOf } from "@/lib/guard";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Admin",
  description: "Wellness Tech Distribution admin.",
  canonicalPath: "/admin",
  noIndex: true,
});

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/admin/login?next=/admin");
  if (!rolesOf(user.roles).includes("admin")) redirect("/portal");
  return <PortalFrame user={user}>{children}</PortalFrame>;
}
