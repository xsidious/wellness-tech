import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function PriceListPage() {
  const user = await requireUser();
  const showPrice = user.org.verificationTier >= 1;
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ productClass: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  const groups = new Map<string, typeof products>();
  for (const product of products) {
    const key = product.productClass || "General";
    const list = groups.get(key) || [];
    list.push(product);
    groups.set(key, list);
  }

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Formulary"
        title="Price list"
        lede={
          showPrice
            ? "Practice pricing organized by product class — compounds, office-use, and supplies in one list."
            : "Browse the formulary. Practice unit prices unlock at verification Tier 1+."
        }
        actions={
          <Link className="btn btn-accent" href="/portal/catalog">
            Order from catalog
          </Link>
        }
      />

      {!showPrice ? (
        <SectionCard title="Pricing locked">
          <p className="muted">
            Your practice is on Tier 0. Complete credentialing with your Wellness Tech rep to unlock the live price list.
          </p>
        </SectionCard>
      ) : null}

      {!products.length ? (
        <EmptyState title="No active SKUs" body="The formulary is empty for this environment." />
      ) : (
        Array.from(groups.entries()).map(([klass, rows]) => (
          <SectionCard
            key={klass}
            title={klass}
            description={`${rows.length} active SKU${rows.length === 1 ? "" : "s"}`}
            flush
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Strength / size</th>
                    <th>Storage</th>
                    <th>Rx</th>
                    <th>Price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <b>{product.name}</b>
                        <div className="muted">{product.sku}</div>
                      </td>
                      <td>{product.category || "—"}</td>
                      <td>
                        {[product.strength, product.size, product.form].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td>{product.storage === "cold" ? "Cold chain" : "Ambient"}</td>
                      <td>
                        <StatusBadge tone={product.rxRequired ? "info" : "neutral"}>
                          {product.rxRequired ? "Rx" : product.officeUse ? "Office" : "OTC"}
                        </StatusBadge>
                      </td>
                      <td>
                        {!showPrice
                          ? "Hidden"
                          : product.priceCents
                            ? money(product.priceCents)
                            : "Not set"}
                      </td>
                      <td>
                        <Link href={`/portal/catalog/${product.sku}`}>Details</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}
