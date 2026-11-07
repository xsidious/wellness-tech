import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge } from "@/components/portal/Workspace";
import { syncRxHereFormularyAction } from "@/lib/actions";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; source?: string; error?: string }>;
}) {
  const query = await searchParams;
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Catalog"
        title="Formulary"
        lede="Network product catalog. Sync pulls Partner API with a local formulary fallback — no deploy required for edits."
        actions={
          <form action={syncRxHereFormularyAction}>
            <button className="btn btn-accent" type="submit">
              Sync formulary
            </button>
          </form>
        }
      />
      {query.synced ? (
        <p className="note">
          Synced {query.synced} SKUs from {query.source || "formulary"}.
        </p>
      ) : null}
      {query.error ? <p className="error">{query.error}</p> : null}
      <SectionCard title={`${products.length} SKUs`} flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Class</th>
                <th>Category</th>
                <th>Price</th>
                <th>Rx</th>
                <th>Orderable</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <Link href={`/admin/products/${product.id}`}>
                      <b>{product.sku}</b>
                    </Link>
                  </td>
                  <td>{product.name}</td>
                  <td>{product.productClass}</td>
                  <td className="muted">{product.category}</td>
                  <td>{money(product.priceCents)}</td>
                  <td>{product.rxRequired ? <StatusBadge tone="info">Rx</StatusBadge> : "—"}</td>
                  <td>{product.orderable ? <StatusBadge tone="ok">Yes</StatusBadge> : <StatusBadge tone="danger">No</StatusBadge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
