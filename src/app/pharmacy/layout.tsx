import { PortalFrame } from "@/components/PortalFrame";
import { requireUser, rolesOf } from "@/lib/guard";
import { redirect } from "next/navigation";

export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/pharmacy");
  const roles = rolesOf(user.roles);
  if (!roles.includes("pharmacy") && !roles.includes("admin")) {
    redirect("/portal");
  }
  return (
    <PortalFrame user={user} workspace="pharmacy">
      {children}
    </PortalFrame>
  );
}
