import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Equipment and Supplies",
  description: "Aesthetic equipment, devices, ancillaries, and medical supplies for licensed practices.",
  canonicalPath: "/supplies",
});

import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { equipmentCatalog, equipmentHoldReason } from "@/lib/equipment-catalog";
import { photos } from "@/lib/photos";

export default function SuppliesPage() {
  const celexo = equipmentCatalog[0];

  return (
    <MarketingShell>
      <section className="wrap page-banner stack">
        <span className="kicker">Equipment and supplies</span>
        <h1>Devices and supplies share the same cart.</h1>
        <p className="lede">They can ship with prescription lines and still land on one invoice. Sales tax rules wait on the processor decision.</p>
        <Link className="btn btn-dark" href="/signup">Open a practice account</Link>
      </section>

      <section className="wrap section stack">
        <span className="kicker">Featured equipment</span>
        <h2 style={{ margin: 0 }}>{celexo.name}</h2>
        <p className="lede" style={{ margin: 0 }}>{celexo.tagline}</p>

        <img
          className="equipment-photo"
          src={celexo.image}
          alt={`${celexo.name} 4-in-1 multi-functional platform`}
        />

        <article className="equipment-feature">
          <div className="stack">
            <span className="kicker">{celexo.form}</span>
            <b style={{ fontSize: 28 }}>{celexo.name}</b>
            <span className="muted">{celexo.manufacturer} · {celexo.size}</span>
            <span>{celexo.description}</span>
            <ul className="equipment-highlights">
              {celexo.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <span className="note">{equipmentHoldReason}</span>
            <span className="muted" style={{ fontSize: 12 }}>{celexo.disclaimer}</span>
          </div>
        </article>

        <div className="grid-2" style={{ marginTop: 8 }}>
          {celexo.handpieces.map((hp) => (
            <article className="card" key={hp.name}>
              <span className="kicker">{hp.role}</span>
              <b>{hp.name}</b>
              <span>{hp.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap section stack" style={{ paddingTop: 0 }}>
        <span className="kicker">Also available</span>
        <h2 style={{ margin: 0 }}>Clinical supplies</h2>
        <article className="card" style={{ maxWidth: 560 }}>
          <img className="card-photo" src={photos.supplies} alt="" />
          <b>Syringes and ancillaries</b>
          <span>Syringes, ancillaries, and the items that travel with a treatment. These lines can earn affiliate commission after delivery.</span>
        </article>
      </section>
    </MarketingShell>
  );
}
