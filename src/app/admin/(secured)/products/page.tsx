import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge } from "@/components/portal/Workspace";
import { syncPrescribeUsaCatalogAction, syncRxHereFormularyAction } from "@/lib/actions";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

type VendorFilter = "all" | "eventide" | "prescribeusa";

function vendorOf(category: string): "eventide" | "prescribeusa" | "other" {
  if (/^Eventide/i.test(category)) return "eventide";
  if (/^PrescribeUSA/i.test(category)) return "prescribeusa";
  return "other";
}

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; source?: string; error?: string; vendor?: string }>;
}) {
  const query = await searchParams;
  const vendor = (["all", "eventide", "prescribeusa"].includes(String(query.vendor || ""))
    ? (query.vendor as VendorFilter)
    : "all") as VendorFilter;

  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  const filtered = products.filter((product) => {
    if (vendor === "all") return true;
    return vendorOf(product.category) === vendor;
  });

  const counts = {
    all: products.length,
    eventide: products.filter((p) => vendorOf(p.category) === "eventide").length,
    prescribeusa: products.filter((p) => vendorOf(p.category) === "prescribeusa").length,
  };

  const lastSynced = products.reduce<Date | null>((latest, product) => {
    if (!product.lastSyncedAt) return latest;
    if (!latest || product.lastSyncedAt > latest) return product.lastSyncedAt;
    return latest;
  }, null);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Catalog"
        title="Formulary"
        lede="Eventide (VitaRelay) + PrescribeUSA catalogs. Sync each vendor separately; categories stay under Eventide · … or PrescribeUSA · …"
        actions={
          <>
            <form action={syncRxHereFormularyAction}>
              <button className="btn btn-accent" type="submit">
                Sync Eventide catalog
              </button>
            </form>
            <form action={syncPrescribeUsaCatalogAction}>
              <button className="btn" type="submit">
                Sync PrescribeUSA
              </button>
            </form>
          </>
        }
      />
      {query.synced ? (
        <p className="note">
          Synced {query.synced} SKUs from {query.source || "formulary"}.
        </p>
      ) : null}
      {lastSynced ? (
        <p className="muted">Last successful sync: {lastSynced.toLocaleString()}</p>
      ) : (
        <p className="muted">No catalog sync recorded yet.</p>
      )}
      {query.error ? <p className="error">{query.error}</p> : null}

      <div className="ws-inline" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        {(
          [
            ["all", `All (${counts.all})`],
            ["eventide", `Eventide (${counts.eventide})`],
            ["prescribeusa", `PrescribeUSA (${counts.prescribeusa})`],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/products?vendor=${key}`}
            className={vendor === key ? "btn btn-accent" : "btn"}
          >
            {label}
          </Link>
        ))}
      </div>

      <SectionCard title={`${filtered.length} SKUs`} flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Vendor</th>
                <th>Class</th>
                <th>Category</th>
                <th>Price</th>
                <th>Rx</th>
                <th>CS</th>
                <th>Orderable</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const v = vendorOf(product.category);
                return (
                  <tr key={product.id}>
                    <td>
                      <Link href={`/admin/products/${product.id}`}>
                        <b>{product.sku.slice(0, 8)}…</b>
                      </Link>
                    </td>
                    <td>{product.name}</td>
                    <td>
                      {v === "eventide" ? (
                        <StatusBadge tone="info">Eventide</StatusBadge>
                      ) : v === "prescribeusa" ? (
                        <StatusBadge tone="ok">PrescribeUSA</StatusBadge>
                      ) : (
                        <span className="muted">Other</span>
                      )}
                    </td>
                    <td>{product.productClass}</td>
                    <td className="muted">{product.category}</td>
                    <td>{money(product.priceCents)}</td>
                    <td>{product.rxRequired ? <StatusBadge tone="info">Rx</StatusBadge> : "—"}</td>
                    <td>
                      {product.controlledSubstance ? <StatusBadge tone="danger">CS</StatusBadge> : "—"}
                    </td>
                    <td>
                      {product.orderable ? (
                        <StatusBadge tone="ok">Yes</StatusBadge>
                      ) : (
                        <StatusBadge tone="danger">No</StatusBadge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
