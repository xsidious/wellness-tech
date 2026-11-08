import { notFound } from "next/navigation";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function PatientPayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await prisma.patientInvoice.findUnique({
    where: { payToken: token },
    include: { org: true },
  });
  if (!invoice) notFound();

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 480, margin: "48px auto" }}>
        <p className="muted">{invoice.org.legalName}</p>
        <h1>Invoice {invoice.invoiceNumber}</h1>
        <p>{invoice.description || "Services"}</p>
        <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{money(invoice.amountCents)}</p>
        <p>
          Status: <strong>{invoice.status}</strong>
        </p>
        {invoice.status === "paid" ? (
          <p className="note">This invoice is already paid. Thank you.</p>
        ) : (
          <p className="muted">
            Card capture for patient pay-links will charge through your practice merchant account. For now, please pay your
            practice directly or wait for the live processor hookup — your practice can also mark this paid from their
            portal.
          </p>
        )}
      </div>
    </main>
  );
}
