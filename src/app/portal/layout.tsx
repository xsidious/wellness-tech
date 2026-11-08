import type { Metadata } from "next";
import { PortalFrame } from "@/components/PortalFrame";
import { requireUser, rolesOf } from "@/lib/guard";
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
  const practice =
    roles.some((r) => ["owner", "prescriber", "staff", "billing"].includes(r)) ||
    (!roles.includes("affiliate") && !roles.includes("pharmacy") && !roles.includes("admin"));

  let badges: { refills?: number; messages?: number; unpaid?: number } | undefined;
  if (practice) {
    const [dueRefills, openRequests, unreadMessages, unpaid] = await Promise.all([
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
    ]);
    badges = {
      refills: dueRefills + openRequests,
      messages: unreadMessages,
      unpaid,
    };
  }

  return (
    <PortalFrame user={user} badges={badges}>
      {children}
    </PortalFrame>
  );
}
