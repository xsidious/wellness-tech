import { prisma } from "@/lib/prisma";

export async function notifyOrg(input: {
  orgId: string;
  userId?: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
}) {
  return prisma.appNotification.create({
    data: {
      orgId: input.orgId,
      userId: input.userId || "",
      kind: input.kind,
      title: input.title,
      body: input.body || "",
      href: input.href || "",
    },
  });
}

export async function unreadNotificationCount(orgId: string, userId: string) {
  return prisma.appNotification.count({
    where: {
      orgId,
      readAt: null,
      OR: [{ userId: "" }, { userId }],
    },
  });
}
