import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalFrame } from "@/components/PortalFrame";
import { requireUser, rolesOf } from "@/lib/guard";
import { unreadNotificationCount } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Practice Portal",
  description: "Wellness Tech Distribution practice portal.",
  canonicalPath: "/portal",
  noIndex: true,
});

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);

  if (roles.includes("patient") && !roles.some((r) => ["owner", "prescriber", "staff", "billing", "admin"].includes(r))) {
    redirect("/patient/portal");
  }
  if (roles.includes("pharmacy") && !roles.some((r) => ["owner", "prescriber", "staff", "admin"].includes(r))) {
    redirect("/pharmacy");
  }

  const practice =
    roles.some((r) => ["owner", "prescriber", "staff", "billing"].includes(r)) ||
    (!roles.includes("affiliate") && !roles.includes("pharmacy") && !roles.includes("admin"));

  let badges:
    | { refills?: number; messages?: number; unpaid?: number; scripts?: number; alerts?: number }
    | undefined;
  if (practice) {
    const [dueRefills, openRequests, unreadMessages, unpaid, pendingScripts, alerts] = await Promise.all([
      prisma.refill.count({ where: { orgId: user.orgId, status: "due" } }),
      prisma.refillRequest.count({
        where: { status: "requested", clinicalPatient: { orgId: user.orgId } },
      }),
      prisma.message.count({
        where: {
          orgId: user.orgId,
          channel: "patient",
          readAt: null,
          NOT: { authorUserId: user.id },
        },
      }),
      prisma.order.count({
        where: { orgId: user.orgId, paymentStatus: { in: ["unpaid", "pending", "failed"] } },
      }),
      prisma.order.count({ where: { orgId: user.orgId, escriptStatus: "pending_signature" } }),
      unreadNotificationCount(user.orgId, user.id),
    ]);
    badges = {
      refills: dueRefills + openRequests,
      messages: unreadMessages,
      unpaid,
      scripts: pendingScripts,
      alerts,
    };
  }

  const branding = (() => {
    try {
      return JSON.parse(user.org.brandingJson || "{}") as {
        active?: boolean;
        displayName?: string;
        tagline?: string;
        primary?: string;
        secondary?: string;
        accent?: string;
        customDomain?: string;
      };
    } catch {
      return {};
    }
  })();
  const brandActive = Boolean(branding.active);
  const brandStyle: CSSProperties | undefined = brandActive
    ? ({
        ["--brand"]: String(branding.primary || "#184868"),
        ["--brand-mid"]: String(branding.secondary || "#245a78"),
        ["--brand-dark"]: String(branding.primary || "#0f2d42"),
        ["--accent"]: String(branding.accent || branding.primary || "#c4a574"),
      } as CSSProperties)
    : undefined;

  return (
    <div style={brandStyle} data-branded={brandActive ? "1" : "0"}>
      <PortalFrame
        user={{
          ...user,
          org: {
            ...user.org,
            legalName: brandActive && branding.displayName ? String(branding.displayName) : user.org.legalName,
          },
        }}
        badges={badges}
        brandTagline={brandActive ? String(branding.tagline || "") : undefined}
      >
        {children}
      </PortalFrame>
    </div>
  );
}
