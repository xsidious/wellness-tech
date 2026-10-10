import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Patients",
  description: "How patients interact with Wellness Tech fulfilled therapies through their licensed practice.",
  canonicalPath: "/patient",
});

import { MarketingShell } from "@/components/MarketingShell";
import { Concierge } from "@/components/Concierge";
import { currentUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const STEPS = ["received", "verified", "compounding", "shipped", "delivered"];

export default async function PatientPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const id = (await searchParams).order;
  const user = await currentUser();
  const order = user && id
    ? await prisma.order.findFirst({ where: { id, orgId: user.orgId }, include: { lines: true } })
    : null;
  const initials = order?.lines.find((line) => line.patientInitials)?.patientInitials || "A.B.";
  return (
    <MarketingShell>
      <section className="wrap section stack" style={{ maxWidth: 760 }}>
        <span className="kicker">Patient app</span>
        <h1>Hi. This view is for {initials}.</h1>
        {order ? (
          <>
            <p>Invoice {order.invoiceNumber} · {order.status}. Cold-chain packages should be refrigerated on arrival.</p>
            <div className="timeline">
              {STEPS.map((step) => <span key={step} className={STEPS.indexOf(order.status) >= STEPS.indexOf(step) ? "on" : ""}>{step}</span>)}
            </div>
            <div className="card">
              <b>Next refill</b>
              <span>A prescriber approves the check-in before another shipment. You can ask the practice to pause.</span>
            </div>
          </>
        ) : (
          <>
            <p>Sample tracking for a practice-branded order. Live invoices open only for that practice.</p>
            <div className="timeline">
              {STEPS.map((step) => <span key={step} className={step === "shipped" || step === "received" || step === "verified" || step === "compounding" ? "on" : ""}>{step}</span>)}
            </div>
            <div className="card"><b>Next refill</b><span>Ships after a clinician check-in. Pause stays with the practice.</span></div>
          </>
        )}
        <Concierge />
      </section>
    </MarketingShell>
  );
}
