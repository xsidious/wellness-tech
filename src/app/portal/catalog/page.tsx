import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/portal/Workspace";
import { addToCart } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { photoForClass } from "@/lib/photos";
import { prisma } from "@/lib/prisma";
import { canOrder, isProductClass } from "@/lib/rules";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string; class?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const office = params.office === "1";
  const classFilter = params.class || "";
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(office ? { officeUse: true } : {}),
      ...(classFilter ? { productClass: classFilter } : {}),
    },
    orderBy: { name: "asc" },
  });
  const showPrice = user.org.verificationTier >= 1;
  const classes = Array.from(new Set(products.map((p) => p.productClass).filter(Boolean)));

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={office ? "Office use" : "Commerce"}
        title={office ? "Office stock" : "Catalog"}
        lede={
          showPrice
            ? "Order compounds and supplies. Prescription lines capture patient initials and sig for pharmacy release."
            : "Tier 0 can browse. Prices unlock at Tier 1."
        }
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/portal/price-list">
              Price list
            </Link>
            <Link className="btn btn-accent" href="/portal/cart">
              Cart
            </Link>
          </div>
        }
      />

      <div className="ws-filter-row">
        <Link
          href={office ? "/portal/catalog?office=1" : "/portal/catalog"}
          className={`ws-filter${!classFilter ? " active" : ""}`}
        >
          All
        </Link>
        {classes.map((klass) => (
          <Link
            key={klass}
            href={`${office ? "/portal/catalog?office=1&class=" : "/portal/catalog?class="}${encodeURIComponent(klass)}`}
            className={`ws-filter${classFilter === klass ? " active" : ""}`}
          >
            {klass}
          </Link>
        ))}
        {!office ? (
          <Link href="/portal/office-stock" className="ws-filter">
            Office stock only
          </Link>
        ) : (
          <Link href="/portal/catalog" className="ws-filter">
            Full catalog
          </Link>
        )}
      </div>

      {!products.length ? (
        <EmptyState title="No products" body="No active SKUs match this filter." />
      ) : (
        <div className="ws-catalog-grid">
          {products.map((product) => {
            const gate = isProductClass(product.productClass)
              ? canOrder(user.org.verificationTier, product.productClass, product.orderable)
              : { ok: false, reason: "Unknown class." };
            return (
              <article className="ws-product" key={product.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ws-product-photo"
                  src={photoForClass(product.productClass, product.category)}
                  alt=""
                />
                <div className="ws-product-body">
                  <div className="ws-chip-row">
                    <span className="ws-chip">{product.category || product.form || product.productClass}</span>
                    {product.rxRequired ? <StatusBadge tone="info">Rx</StatusBadge> : null}
                    {product.officeUse ? <StatusBadge tone="neutral">Office</StatusBadge> : null}
                  </div>
                  <h3>{product.name}</h3>
                  <p className="muted">{product.description || "Formulary item"}</p>
                  <p className="ws-product-meta">
                    {!showPrice
                      ? "Price hidden"
                      : product.priceCents
                        ? money(product.priceCents)
                        : "Price not set"}
                    {" · "}
                    {product.storage === "cold" ? "Cold chain" : "Ambient"}
                  </p>
                  {gate.ok ? (
                    <form action={addToCart} className="ws-product-form">
                      <input type="hidden" name="productId" value={product.id} />
                      <label>
                        Qty
                        <input name="qty" type="number" min={1} defaultValue={1} />
                      </label>
                      {product.rxRequired ? (
                        <>
                          <label>
                            Patient initials
                            <input name="initials" placeholder="A.B." required />
                          </label>
                          <label>
                            Sig for the prescriber
                            <input name="sig" placeholder="As directed by prescriber" required />
                          </label>
                        </>
                      ) : null}
                      <button className="btn btn-accent" type="submit">
                        Add to cart
                      </button>
                    </form>
                  ) : (
                    <p className="error">{product.holdReason || gate.reason}</p>
                  )}
                  <Link href={`/portal/catalog/${product.sku}`} className="ws-text-link">
                    View details
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SectionCard title="Need the spreadsheet view?">
        <p className="muted">Use the organized formulary price list for class-by-class pricing without product cards.</p>
        <Link className="btn btn-ghost" href="/portal/price-list">
          Open price list
        </Link>
      </SectionCard>
    </div>
  );
}
