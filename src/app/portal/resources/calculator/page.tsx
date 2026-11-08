"use client";

import { useMemo, useState } from "react";
import { PageHeader, SectionCard } from "@/components/portal/Workspace";

export default function PeptideCalculatorPage() {
  const [vialMg, setVialMg] = useState(5);
  const [bacMl, setBacMl] = useState(2);
  const [doseMcg, setDoseMcg] = useState(250);
  const [syringeUnits, setSyringeUnits] = useState(100);

  const result = useMemo(() => {
    const concentrationMcgPerMl = (vialMg * 1000) / Math.max(bacMl, 0.0001);
    const drawMl = doseMcg / Math.max(concentrationMcgPerMl, 0.0001);
    const units = drawMl * syringeUnits;
    return {
      concentrationMcgPerMl,
      drawMl,
      units,
    };
  }, [vialMg, bacMl, doseMcg, syringeUnits]);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Resources"
        title="Peptide calculator"
        lede="Reconstitution and insulin-syringe unit helper for lyophilized vials. Educational only — follow the signed prescription."
      />
      <SectionCard title="Reconstitution">
        <div className="ws-kv">
          <label>
            Vial content (mg)
            <input type="number" value={vialMg} min={0.1} step={0.1} onChange={(e) => setVialMg(Number(e.target.value))} />
          </label>
          <label>
            Bacteriostatic water (mL)
            <input type="number" value={bacMl} min={0.1} step={0.1} onChange={(e) => setBacMl(Number(e.target.value))} />
          </label>
          <label>
            Desired dose (mcg)
            <input type="number" value={doseMcg} min={1} step={1} onChange={(e) => setDoseMcg(Number(e.target.value))} />
          </label>
          <label>
            Syringe units per mL
            <input
              type="number"
              value={syringeUnits}
              min={40}
              step={10}
              onChange={(e) => setSyringeUnits(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="ws-stat-grid" style={{ marginTop: 16 }}>
          <div className="ws-stat">
            <span className="ws-stat-label">Concentration</span>
            <strong className="ws-stat-value" style={{ fontSize: "1.2rem" }}>
              {result.concentrationMcgPerMl.toFixed(0)} mcg/mL
            </strong>
          </div>
          <div className="ws-stat ws-stat-accent">
            <span className="ws-stat-label">Draw volume</span>
            <strong className="ws-stat-value" style={{ fontSize: "1.2rem" }}>
              {result.drawMl.toFixed(3)} mL
            </strong>
          </div>
          <div className="ws-stat ws-stat-ok">
            <span className="ws-stat-label">Syringe units</span>
            <strong className="ws-stat-value" style={{ fontSize: "1.2rem" }}>
              {result.units.toFixed(1)} u
            </strong>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
