import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Developers",
  description: "Partner API and webhook documentation for Wellness Tech Distribution integrations.",
  canonicalPath: "/developers",
});

import { redirect } from "next/navigation";
import { createSandboxKey, placeSandboxApiOrder } from "@/lib/actions";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PortalFrame } from "@/components/PortalFrame";

export default async function DevelopersPage() {
  const user = await requireUser();
  if (!rolesOf(user.roles).includes("admin")) redirect("/portal");
  const deliveries = await prisma.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 12 });
  const keys = await prisma.apiKey.findMany();
  return (
    <PortalFrame user={user}>
      <h1>Developer sandbox</h1>
      <p>Demo key <code>wt_sandbox_demo_key</code>. POST /api/v1/orders with Bearer auth and an Idempotency-Key. Webhooks are signed with HMAC and posted to /api/webhooks/rxcore.</p>
      <form action={placeSandboxApiOrder}><button className="btn btn-accent">Place sandbox supply order and ship it</button></form>
      <form className="form" action={createSandboxKey}>
        <label>New key label<input name="label" placeholder="Clinic sandbox" /></label>
        <button className="btn btn-dark">Create sandbox key</button>
      </form>
      <h2>Keys</h2>
      <ul>{keys.map((key) => <li key={key.id}>{key.label} · {key.prefix}… · sandbox</li>)}</ul>
      <h2>Webhook log</h2>
      <ul>{deliveries.map((row) => <li key={row.id}>{row.type} · {row.status} · {row.eventId}</li>)}</ul>
    </PortalFrame>
  );
}
