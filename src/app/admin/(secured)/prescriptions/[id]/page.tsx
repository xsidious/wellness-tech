import Link from "next/link";
import { notFound } from "next/navigation";
import { EscriptDocument } from "@/components/escript/EscriptDocument";
import { PageHeader } from "@/components/portal/Workspace";
import { prisma } from "@/lib/prisma";

export default async function AdminEscriptDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { print } = await searchParams;
  const script = await prisma.eScript.findUnique({
    where: { id: (await params).id },
    include: {
      order: true,
      clinicalPatient: true,
      signedBy: true,
    },
  });
  if (!script) notFound();

  return (
    <div className={`ws-stack${print === "1" ? " escript-print-page" : ""}`}>
      {print !== "1" ? (
        <PageHeader
          kicker="Prescription record"
          title={script.order.invoiceNumber}
          lede="Immutable eScript artifact with patient/medication snapshot, attestation, signature, and content hash."
          actions={
            <div className="ws-head-actions">
              <Link className="btn btn-ghost" href="/admin/prescriptions">
                ← Prescriptions
              </Link>
              <Link className="btn btn-ghost" href={`/admin/orders/${script.orderId}`}>
                Order
              </Link>
              <Link className="btn btn-accent" href={`/admin/prescriptions/${script.id}?print=1`}>
                Print / PDF
              </Link>
            </div>
          }
        />
      ) : null}
      <EscriptDocument
        script={script}
        printHref={`/admin/prescriptions/${script.id}?print=1`}
        orderHref={`/admin/orders/${script.orderId}`}
        patientHref={script.clinicalPatientId ? `/admin/patients/${script.clinicalPatientId}` : undefined}
      />
    </div>
  );
}
