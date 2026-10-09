import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { photos } from "@/lib/photos";
import { exosomeCatalog, exosomeUse } from "@/lib/exosome-catalog";

export default function ExosomesPage() {
  const lines = [...exosomeCatalog].sort(
    (a, b) => a.category.localeCompare(b.category) || a.sku.localeCompare(b.sku),
  );
  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const bucket = groups.get(line.category) || [];
    bucket.push(line);
    groups.set(line.category, bucket);
  }
  return (
    <MarketingShell>
      <PageBanner
        kicker="Exosomes"
        title="Celexo and Lumidor, listed for practices."
        lede="Celexo lines are for topical use. Lumidor lines are exosome-infused topicals. Catalog listed below — pricing available upon request."
        image={photos.exosomes}
      />
      <section className="wrap section stack">
        <p className="note" style={{ margin: 0 }}>
          Pricing available upon request for verified practices.
        </p>
        {[...groups.entries()].map(([category, items]) => (
          <div className="stack" key={category}>
            <h2 style={{ margin: 0 }}>{category}</h2>
            <p className="muted" style={{ margin: 0 }}>{exosomeUse(category)}</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Item</th><th>Product</th><th>Size</th></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.sku}>
                      <td>{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </MarketingShell>
  );
}
