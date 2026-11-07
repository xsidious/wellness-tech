import Link from "next/link";
import { notFound } from "next/navigation";
import { EscriptDocument } from "@/components/escript/EscriptDocument";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function PortalEscriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const user = await requireUser();
  const { print } = await searchParams;
  const order = await prisma.order.findFirst({
    where: { id: (await params).id, orgId: user.orgId },
    include: {
      clinicalPatient: true,
      escripts: { where: { status: "signed" }, orderBy: { signedAt: "desc" }, take: 1 },
    },
  });
  if (!order) notFound();
  const script = order.escripts[0];
  if (!script) notFound();

  return (
    <div className={`ws-stack${print === "1" ? " escript-print-page" : ""}`}>
      {print !== "1" ? (
        <div className="ws-head-actions" style={{ justifyContent: "flex-start" }}>
          <Link className="btn btn-ghost" href={`/portal/orders/${order.id}`}>
            ← Order
          </Link>
          <Link className="btn btn-accent" href={`/portal/orders/${order.id}/escript?print=1`}>
            Print / PDF
          </Link>
        </div>
      ) : null}
      <EscriptDocument
        script={{ ...script, order: { id: order.id, invoiceNumber: order.invoiceNumber }, clinicalPatient: order.clinicalPatient }}
        printHref={`/portal/orders/${order.id}/escript?print=1`}
        orderHref={`/portal/orders/${order.id}`}
        patientHref={order.clinicalPatientId ? `/portal/patients/${order.clinicalPatientId}` : undefined}
      />
    </div>
  );
}
