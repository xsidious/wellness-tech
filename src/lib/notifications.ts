import { sendTransactionalEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

function parsePrefs(raw: string | null | undefined) {
  try {
    return JSON.parse(raw || "{}") as Record<string, boolean>;
  } catch {
    return {} as Record<string, boolean>;
  }
}

export async function notifyOrg(input: {
  orgId: string;
  userId?: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  /** When true, also email org users if orderUpdatesEmail / matching prefs allow. */
  email?: boolean;
}) {
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  const prefs = parsePrefs(org?.notificationPrefsJson);
  const isOrder = input.kind.startsWith("order") || input.kind.includes("script") || input.kind.includes("invoice");
  const allowInApp = prefs.orderUpdatesInApp !== false;
  const allowEmail = input.email !== false && prefs.orderUpdatesEmail !== false && isOrder;

  const note = allowInApp
    ? await prisma.appNotification.create({
        data: {
          orgId: input.orgId,
          userId: input.userId || "",
          kind: input.kind,
          title: input.title,
          body: input.body || "",
          href: input.href || "",
        },
      })
    : null;

  if (allowEmail && org) {
    const users = await prisma.user.findMany({
      where: {
        orgId: input.orgId,
        OR: [
          { roles: { contains: "owner" } },
          { roles: { contains: "prescriber" } },
          { roles: { contains: "staff" } },
          { roles: { contains: "billing" } },
        ],
      },
      take: 12,
      select: { email: true },
    });
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.wellnesstechdistribution.com").replace(/\/$/, "");
    const link = input.href ? `${appUrl}${input.href}` : appUrl;
    await Promise.allSettled(
      users
        .filter((u) => u.email.includes("@"))
        .map((u) =>
          sendTransactionalEmail({
            to: u.email,
            subject: input.title,
            text: `${input.body || input.title}\n\n${link}`,
            html: `<p>${input.body || input.title}</p><p><a href="${link}">Open portal</a></p>`,
          }),
        ),
    );
  }

  return note;
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
