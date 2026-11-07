import { CheckoutForm } from "@/components/CheckoutForm";
import { PageHeader, SectionCard } from "@/components/portal/Workspace";
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
  const classes = products.flatMap((product) => (isProductClass(product.productClass) ? [product.productClass] : []));
  const split = fulfillmentGroups(classes);
  const needsEscript = products.some((p) => requiresEscript(p.productClass, p.rxRequired));
  const subtotal = items.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return sum + (product?.priceCents || 0) * item.qty;
  }, 0);
  const shipping = shippingCents(products.map((product) => product.storage));
  const sandbox = paymentsSandboxEnabled();

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
      <SectionCard title="Authorize order">
        <CheckoutForm needsEscript={needsEscript} paymentsSandbox={sandbox} />
      </SectionCard>
    </div>
  );
}
