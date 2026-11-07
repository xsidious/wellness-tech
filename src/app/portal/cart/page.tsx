import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/components/portal/Workspace";
import { removeCartItem } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { fulfillmentGroups, isProductClass, shippingCents } from "@/lib/rules";

export default async function CartPage() {
  const user = await requireUser();
  const items = await prisma.cartItem.findMany({ where: { userId: user.id } });
  const products = await prisma.product.findMany({ where: { id: { in: items.map((item) => item.productId) } } });
  const byId = new Map(products.map((product) => [product.id, product]));
  const classes = products.filter((product) => isProductClass(product.productClass)).map((product) => product.productClass);
  const split = fulfillmentGroups(classes);
  const subtotal = items.reduce((sum, item) => sum + (byId.get(item.productId)?.priceCents || 0) * item.qty, 0);
  const shipping = items.length ? shippingCents(products.map((product) => product.storage)) : 0;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Checkout"
        title="Cart"
        lede="Review prescription and office-use lines before payment. Patient initials and sig travel with Rx lines into pharmacy routing."
        actions={
          <Link className="btn btn-ghost" href="/portal/catalog">
            Continue shopping
          </Link>
        }
      />

      {split.message ? <p className="note">{split.message}</p> : null}

      <SectionCard title="Line items">
        {items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Patient</th>
                  <th>Sig</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const product = byId.get(item.productId);
                  return (
                    <tr key={item.id}>
                      <td>
                        <b>{product?.name}</b>
                        <div className="muted">{product?.sku}</div>
                      </td>
                      <td>{item.patientInitials || "Office"}</td>
                      <td>{item.sig || "—"}</td>
                      <td>{item.qty}</td>
                      <td>{money((product?.priceCents || 0) * item.qty)}</td>
                      <td>
                        <form action={removeCartItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <button className="btn btn-ghost" type="submit">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Cart is empty"
            body="Add compounds or office stock from the catalog or price list."
            action={
              <Link className="btn btn-accent" href="/portal/catalog">
                Browse catalog
              </Link>
            }
          />
        )}
      </SectionCard>

      {items.length ? (
        <SectionCard title="Totals">
          <div className="ws-kv">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>Shipping</span>
              <strong>{money(shipping)}</strong>
            </div>
            <div>
              <span>One total</span>
              <strong>{money(subtotal + shipping)}</strong>
            </div>
          </div>
          <div className="ws-head-actions" style={{ marginTop: 16 }}>
            <Link className="btn btn-accent" href="/portal/checkout">
              Checkout
            </Link>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
