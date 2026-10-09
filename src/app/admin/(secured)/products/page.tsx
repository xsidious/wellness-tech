import Link from "next/link";
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
    <>
      <h1>Catalog</h1>
      <p>Edits here do not need a developer deploy.</p>
      <form action={syncRxHereFormularyAction} className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn btn-accent" type="submit">Sync RxHere formulary</button>
        <span className="muted">Probes the Partner API, then falls back to the local formulary file.</span>
      </form>
      {query.synced ? (
        <p className="note">Synced {query.synced} SKUs from {query.source || "formulary"}.</p>
      ) : null}
      {query.error ? <p className="error">{query.error}</p> : null}
      <div className="table-wrap">
      <table className="table">
        <thead><tr><th>SKU</th><th>Name</th><th>Class</th><th>Price</th><th>Orderable</th></tr></thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td><Link href={`/admin/products/${product.id}`}>{product.sku}</Link></td>
              <td>{product.name}</td>
              <td>{product.productClass}</td>
              <td>{money(product.priceCents)}</td>
              <td>{product.orderable ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
