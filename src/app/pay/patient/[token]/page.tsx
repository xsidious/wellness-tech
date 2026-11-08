import { notFound } from "next/navigation";
import { money } from "@/lib/money";
import { payPatientInvoiceByToken } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function PatientPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; already?: string }>;
}) {
  const { token } = await params;
  const q = await searchParams;
  const invoice = await prisma.patientInvoice.findUnique({
    where: { payToken: token },
    include: { org: true },
  });
  if (!invoice) notFound();
  const branding = (() => {
    try {
      return JSON.parse(invoice.org.brandingJson || "{}") as { active?: boolean; displayName?: string; primary?: string };
    } catch {
      return {};
    }
  })();
  const name = branding.active && branding.displayName ? String(branding.displayName) : invoice.org.legalName;

  return (
    <main className="auth-shell">
      <div
        className="auth-card"
        style={{ maxWidth: 480, margin: "48px auto", borderTop: `4px solid ${branding.primary || "#184868"}` }}
      >
        <p className="muted">{name}</p>
        <h1>Invoice {invoice.invoiceNumber}</h1>
        <p>{invoice.description || "Services"}</p>
        <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{money(invoice.amountCents)}</p>
        <p>
          Status: <strong>{invoice.status}</strong>
        </p>
        {q.paid || invoice.status === "paid" ? (
          <p className="note">Payment recorded. Thank you.</p>
        ) : (
          <form action={payPatientInvoiceByToken} className="ws-message-form">
            <input type="hidden" name="token" value={token} />
            <label>
              Name on card
              <input name="cardName" required />
            </label>
            <label>
              Card number
              <input name="cardNumber" inputMode="numeric" required placeholder="Sandbox — not charged through a processor yet" />
            </label>
            <div className="ws-kv">
              <label>
                Exp
                <input name="exp" placeholder="MM/YY" required />
              </label>
              <label>
                CVC
                <input name="cvc" required />
              </label>
              <label>
                Last 4 (confirm)
                <input name="last4" maxLength={4} required />
              </label>
            </div>
            <button className="btn btn-accent" type="submit">
              Pay {money(invoice.amountCents)}
            </button>
            <p className="muted">
              Card details are used to confirm payment intent for this practice invoice. Live merchant capture can be wired to
              your Authorize.net / Stripe keys without changing this patient flow.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
