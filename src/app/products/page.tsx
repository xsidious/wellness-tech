import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { photos } from "@/lib/photos";
import { loadPublicFormulary } from "@/lib/formulary-public";

export default function ProductsPage() {
  const lines = loadPublicFormulary();
  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const bucket = groups.get(line.category) || [];
    bucket.push(line);
    groups.set(line.category, bucket);
  }
  return (
    <MarketingShell>
      <PageBanner
        kicker="Therapies"
        title="RxHere 503A formulary for licensed practices."
        lede="Full catalog below. Pricing is available upon request for verified practices. Patient-specific compounded lines require a prescription."
        image={photos.weight}
      >
        <Link className="btn btn-accent" href="/signup">Get practice access</Link>
      </PageBanner>
      <section className="wrap section stack">
        <p className="note" style={{ margin: 0 }}>
          Pricing available upon request — contact Wellness Tech after practice verification.
        </p>
        {[...groups.entries()].map(([category, items]) => (
          <div className="stack" key={category}>
            <h2 style={{ margin: 0 }}>{category}</h2>
            <p className="muted" style={{ margin: 0 }}>{items.length} SKUs · 503A compounded</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>SKU</th><th>Medication</th><th>Strength</th><th>Size</th><th>Form</th></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.sku}>
                      <td>{item.sku}</td>
                      <td>{item.medication}</td>
                      <td>{item.strength}</td>
                      <td>{item.size}</td>
                      <td>{item.form}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!lines.length ? (
          <p className="note">Formulary file is not present yet. Run the RxHere sync from admin after deploy.</p>
        ) : null}
      </section>
    </MarketingShell>
  );
}
