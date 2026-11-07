import { CheckoutForm } from "@/components/CheckoutForm";
import { PageHeader, SectionCard } from "@/components/portal/Workspace";
import { assertCanSignEscript, buildLinesSnapshot, buildPatientSnapshot } from "@/lib/escript";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { fulfillmentGroups, isProductClass, requiresEscript, shippingCents } from "@/lib/rules";

function paymentsSandboxEnabled() {
  const mode = (process.env.PAYMENTS_MODE || "").trim().toLowerCase();
  if (mode === "live" || mode === "production") return false;
  if (mode === "sandbox") return true;
  return (process.env.SANDBOX_AUTH || "").trim().toLowerCase() === "true" || (process.env.PAYMENTS_SANDBOX || "true").trim().toLowerCase() !== "false";
}

export default async function CheckoutPage() {
  const user = await requireUser();
  const items = await prisma.cartItem.findMany({ where: { userId: user.id } });
  const products = await prisma.product.findMany({ where: { id: { in: items.map((item) => item.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const classes = products.flatMap((product) => (isProductClass(product.productClass) ? [product.productClass] : []));
  const split = fulfillmentGroups(classes);
  const needsEscript = products.some((p) => requiresEscript(p.productClass, p.rxRequired));
  const subtotal = items.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return sum + (product?.priceCents || 0) * item.qty;
  }, 0);
  const shipping = shippingCents(products.map((product) => product.storage));
  const sandbox = paymentsSandboxEnabled();

  const clinicalPatientId = items.map((i) => i.clinicalPatientId).find(Boolean) || null;
  const patient = clinicalPatientId
    ? await prisma.clinicalPatient.findFirst({ where: { id: clinicalPatientId, orgId: user.orgId } })
    : null;

  const previewLines = buildLinesSnapshot(
    items.map((item) => {
      const product = byId.get(item.productId)!;
      return {
        sku: product?.sku || "",
        name: product?.name || "Item",
        productClass: product?.productClass || "",
        qty: item.qty,
        unitPriceCents: product?.priceCents || 0,
        strength: product?.strength || "",
        size: product?.size || "",
        dosageForm: product?.form || "",
        sig: item.sig,
        daysSupply: item.daysSupply,
        patientInitials: item.patientInitials,
      };
    }),
  );

  const gate = needsEscript ? assertCanSignEscript(user) : { ok: true as const };

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Commerce"
        title="Checkout"
        lede={
          sandbox
            ? `Sandbox shipping ${money(shipping)}. Invoice total ${money(subtotal + shipping)}.`
            : `Live payment mode. Shipping ${money(shipping)}. Total ${money(subtotal + shipping)}.`
        }
      />
      {split.message ? <p className="note">{split.message}</p> : null}
      <SectionCard title={needsEscript ? "Sign prescription & authorize" : "Authorize order"} flush={needsEscript}>
        <CheckoutForm
          needsEscript={needsEscript}
          paymentsSandbox={sandbox}
          canSign={gate.ok}
          gateMessage={gate.ok ? undefined : gate.error}
          signerLabel={user.credential?.displayName || user.name}
          npi={user.credential?.npi || ""}
          patient={buildPatientSnapshot(patient)}
          lines={previewLines}
        />
      </SectionCard>
    </div>
  );
}
