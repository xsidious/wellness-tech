import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Equipment and Supplies",
  description: "Aesthetic equipment, devices, ancillaries, and medical supplies for licensed practices.",
  canonicalPath: "/supplies",
});

import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { equipmentCatalog, equipmentHoldReason } from "@/lib/equipment-catalog";
import { photos } from "@/lib/photos";

export default function SuppliesPage() {
  return (
    <MarketingShell>
      <PageBanner
        kicker="Equipment and supplies"
        title="Devices and supplies share the same cart."
        lede="They can ship with prescription lines and still land on one invoice. Sales tax rules wait on the processor decision."
        image={photos.equipment}
      >
        <Link className="btn btn-dark" href="/signup">Open a practice account</Link>
      </PageBanner>
      <section className="wrap section stack">
        <span className="kicker">Now in the catalog</span>
        <h2 style={{ margin: 0 }}>Celexo equipment</h2>
        <div className="grid-2">
          {equipmentCatalog.map((device) => (
            <article className="card" key={device.sku}>
              <img className="card-photo" src={photos.equipment} alt="" />
              <span className="kicker">{device.form}</span>
              <b>{device.name}</b>
              <span>{device.size}</span>
              <span>{device.description}</span>
              <span className="note">{equipmentHoldReason}</span>
            </article>
          ))}
          <article className="card">
            <img className="card-photo" src={photos.supplies} alt="" />
            <b>Clinical supplies</b>
            <span>Syringes, ancillaries, and the items that travel with a treatment. These lines can earn affiliate commission after delivery.</span>
          </article>
        </div>
      </section>
    </MarketingShell>
  );
}
