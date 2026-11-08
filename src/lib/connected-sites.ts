import { prisma } from "@/lib/prisma";
import { ensureKianPartnerOrg } from "@/lib/partner-org";

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw || "") as T;
  } catch {
    return fallback;
  }
}

export type SiteLocalMetrics = {
  ordersTotal: number;
  orders30d: number;
  ordersOpen: number;
  ordersOnHold: number;
  patients: number;
  revenue30dCents: number;
  lastOrderAt: string | null;
};

export type SiteRemoteMetrics = {
  fetchedAt?: string;
  ok?: boolean;
  error?: string;
  usersTotal?: number;
  usersByRole?: Record<string, number>;
  partnersActive?: number;
  ordersTotal?: number;
  orders30d?: number;
  intakesOpen?: number;
  intakesTotal?: number;
  bookings30d?: number;
  submissionsOpen?: number;
  submissionsTotal?: number;
  site?: string;
  environment?: string;
};

type SeedSite = {
  slug: string;
  displayName: string;
  kind: string;
  baseUrl: string;
  sourceKey: string;
  statusWebhookPath: string;
  overviewPath: string;
  healthPath: string;
  secretEnvKey: string;
  notes: string;
};

const DEFAULT_SITES: SeedSite[] = [
  {
    slug: "kian-prive",
    displayName: "KIAN Privé",
    kind: "storefront",
    baseUrl: process.env.KIAN_APP_URL?.trim() || "https://www.kianprive.com",
    sourceKey: "kian-prive",
    statusWebhookPath: "/api/webhooks/wellness-tech-order",
    overviewPath: "/api/webhooks/wellness-tech-overview",
    healthPath: "/",
    secretEnvKey: "WT_PARTNER_ORDER_SECRET",
    notes: "Consumer therapeutics storefront. Forwards paid Rx orders into WT; receives fulfillment status webhooks.",
  },
  {
    slug: "threefold-strength",
    displayName: "Threefold Strength",
    kind: "clinical",
    baseUrl: process.env.THREEFOLD_APP_URL?.trim() || "https://threefoldstrength.com",
    sourceKey: "threefold-strength",
    statusWebhookPath: "/api/kian/webhook",
    overviewPath: "/api/webhooks/wellness-tech-overview",
    healthPath: "/",
    secretEnvKey: "WT_PARTNER_ORDER_SECRET",
    notes: "Partner clinic. Intakes → KIAN Privé; catalog/orders → Wellness Tech.",
  },
  {
    slug: "4everglow",
    displayName: "4everglow Wellness",
    kind: "clinical",
    baseUrl: process.env.FOREVERGLOW_APP_URL?.trim() || "https://4everglow.vercel.app",
    sourceKey: "4everglow",
    statusWebhookPath: "/api/kian/webhook",
    overviewPath: "/api/webhooks/wellness-tech-overview",
    healthPath: "/",
    secretEnvKey: "WT_PARTNER_ORDER_SECRET",
    notes: "Partner aesthetics/wellness clinic. Intakes → KIAN Privé; orders → Wellness Tech.",
  },
  {
    slug: "facial-design",
    displayName: "Facial Design Studio",
    kind: "clinical",
    baseUrl: process.env.FACIAL_DESIGN_APP_URL?.trim() || "https://facialdesignstudio.com",
    sourceKey: "facial-design",
    statusWebhookPath: "/api/kian/webhook",
    overviewPath: "/api/webhooks/wellness-tech-overview",
    healthPath: "/",
    secretEnvKey: "WT_PARTNER_ORDER_SECRET",
    notes: "Partner facial aesthetics clinic. Intakes → KIAN Privé; orders → Wellness Tech.",
  },
];

export async function ensureConnectedSites() {
  const { org } = await ensureKianPartnerOrg();
  for (const seed of DEFAULT_SITES) {
    await prisma.connectedSite.upsert({
      where: { slug: seed.slug },
      create: {
        ...seed,
        orgId: org.id,
        status: "active",
      },
      update: {
        displayName: seed.displayName,
        kind: seed.kind,
        sourceKey: seed.sourceKey,
        orgId: org.id,
        statusWebhookPath: seed.statusWebhookPath,
        overviewPath: seed.overviewPath,
        // Keep operator-edited baseUrl/notes if already set.
      },
    });
  }
  return prisma.connectedSite.findMany({ orderBy: { displayName: "asc" } });
}

export async function computeLocalMetrics(sourceKey: string): Promise<SiteLocalMetrics> {
  if (!sourceKey) {
    return {
      ordersTotal: 0,
      orders30d: 0,
      ordersOpen: 0,
      ordersOnHold: 0,
      patients: 0,
      revenue30dCents: 0,
      lastOrderAt: null,
    };
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const whereSource = { source: sourceKey };
  const [ordersTotal, orders30d, ordersOpen, ordersOnHold, patients, revenue30d, latest] = await Promise.all([
    prisma.order.count({ where: whereSource }),
    prisma.order.count({ where: { ...whereSource, createdAt: { gte: since } } }),
    prisma.order.count({ where: { ...whereSource, status: { notIn: ["delivered", "cancelled"] } } }),
    prisma.order.count({ where: { ...whereSource, status: "on_hold" } }),
    prisma.clinicalPatient.count({ where: { sourceSite: sourceKey } }),
    prisma.order.aggregate({
      where: { ...whereSource, createdAt: { gte: since } },
      _sum: { totalCents: true },
    }),
    prisma.order.findFirst({
      where: whereSource,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return {
    ordersTotal,
    orders30d,
    ordersOpen,
    ordersOnHold,
    patients,
    revenue30dCents: revenue30d._sum.totalCents || 0,
    lastOrderAt: latest?.createdAt?.toISOString() || null,
  };
}

function partnerSecretFor(envKey: string) {
  const key = (envKey || "WT_PARTNER_ORDER_SECRET").trim();
  return (process.env[key] || process.env.WT_PARTNER_ORDER_SECRET || process.env.KIAN_PARTNER_SECRET || "").trim();
}

export async function fetchRemoteOverview(site: {
  baseUrl: string;
  overviewPath: string;
  secretEnvKey: string;
}): Promise<SiteRemoteMetrics> {
  const base = site.baseUrl.replace(/\/$/, "");
  const path = site.overviewPath.startsWith("/") ? site.overviewPath : `/${site.overviewPath}`;
  if (!base) return { ok: false, error: "No base URL configured", fetchedAt: new Date().toISOString() };
  const secret = partnerSecretFor(site.secretEnvKey);
  if (!secret) return { ok: false, error: "Partner secret env missing", fetchedAt: new Date().toISOString() };

  try {
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-wt-partner-secret": secret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const body = (await res.json().catch(() => null)) as SiteRemoteMetrics | null;
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}${body && "error" in (body as object) ? `: ${(body as { error?: string }).error}` : ""}`,
        fetchedAt: new Date().toISOString(),
      };
    }
    return { ...body, ok: true, fetchedAt: new Date().toISOString() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Remote overview failed",
      fetchedAt: new Date().toISOString(),
    };
  }
}

export async function probeSiteHealth(site: {
  baseUrl: string;
  healthPath: string;
}): Promise<{ ok: boolean; detail: string }> {
  const base = site.baseUrl.replace(/\/$/, "");
  const path = site.healthPath.startsWith("/") ? site.healthPath : `/${site.healthPath || ""}`;
  if (!base) return { ok: false, detail: "No base URL" };
  try {
    const res = await fetch(`${base}${path || "/"}`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Health check failed" };
  }
}

export async function refreshConnectedSite(id: string) {
  const site = await prisma.connectedSite.findUnique({ where: { id } });
  if (!site) throw new Error("Site not found");

  const local = await computeLocalMetrics(site.sourceKey || site.slug);
  const remote = await fetchRemoteOverview(site);
  const health = await probeSiteHealth(site);

  return prisma.connectedSite.update({
    where: { id: site.id },
    data: {
      localMetricsJson: JSON.stringify(local),
      remoteMetricsJson: JSON.stringify(remote),
      lastOrderAt: local.lastOrderAt ? new Date(local.lastOrderAt) : site.lastOrderAt,
      lastHealthCheckAt: new Date(),
      lastHealthOk: health.ok,
      lastHealthDetail: health.detail,
      status: site.status === "paused" ? "paused" : remote.ok === false && health.ok === false ? "error" : "active",
    },
  });
}

export async function touchConnectedSiteOrder(sourceKey: string, at = new Date()) {
  if (!sourceKey) return;
  await prisma.connectedSite.updateMany({
    where: { OR: [{ sourceKey }, { slug: sourceKey }] },
    data: { lastOrderAt: at },
  });
}

export async function touchConnectedSiteWebhook(sourceKey: string, ok: boolean, at = new Date()) {
  if (!sourceKey) return;
  await prisma.connectedSite.updateMany({
    where: { OR: [{ sourceKey }, { slug: sourceKey }] },
    data: { lastWebhookAt: at, lastWebhookOk: ok },
  });
}

export function readLocalMetrics(raw: string): SiteLocalMetrics {
  return parseJson(raw, {
    ordersTotal: 0,
    orders30d: 0,
    ordersOpen: 0,
    ordersOnHold: 0,
    patients: 0,
    revenue30dCents: 0,
    lastOrderAt: null,
  });
}

export function readRemoteMetrics(raw: string): SiteRemoteMetrics {
  return parseJson(raw, {});
}
