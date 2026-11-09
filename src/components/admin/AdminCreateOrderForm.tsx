"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/portal/Workspace";
import { placeAdminOrder } from "@/lib/admin-actions";
import { money } from "@/lib/money";

export type AdminOrderProduct = {
  id: string;
  sku: string;
  name: string;
  productClass: string;
  category: string;
  priceCents: number;
  active: boolean;
  orderable: boolean;
  rxRequired: boolean;
  holdReason: string;
};

export type AdminOrderPatient = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  orgId: string;
  orgName: string;
};

export type AdminOrderOrg = {
  id: string;
  legalName: string;
  slug: string;
};

type Line = {
  productId: string;
  qty: number;
  unitPriceCents: number;
  patientInitials: string;
  sig: string;
};

type Props = {
  orgs: AdminOrderOrg[];
  patients: AdminOrderPatient[];
  products: AdminOrderProduct[];
  error?: string;
};

export function AdminCreateOrderForm({ orgs, patients, products, error }: Props) {
  const [orgId, setOrgId] = useState(orgs[0]?.id || "");
  const [patientId, setPatientId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState(false);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    return patients.filter((patient) => {
      if (orgId && patient.orgId !== orgId) return false;
      if (!q) return true;
      return `${patient.fullName} ${patient.email} ${patient.phone}`.toLowerCase().includes(q);
    });
  }, [patients, patientSearch, orgId]);

  const classes = useMemo(
    () => ["all", ...Array.from(new Set(products.map((p) => p.productClass).filter(Boolean))).sort()],
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (classFilter !== "all" && product.productClass !== classFilter) return false;
      if (!q) return true;
      return `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(q);
    });
  }, [products, productSearch, classFilter]);

  const selected = useMemo(() => new Set(lines.map((line) => line.productId)), [lines]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.unitPriceCents * line.qty, 0);
    return { subtotal, count: lines.length };
  }, [lines]);

  function pickPatient(patient: AdminOrderPatient) {
    setPatientId(patient.id);
    setOrgId(patient.orgId);
    setFullName(patient.fullName);
    setEmail(patient.email);
    setPhone(patient.phone);
    setDateOfBirth(patient.dateOfBirth);
  }

  function clearPatient() {
    setPatientId("");
    setFullName("");
    setEmail("");
    setPhone("");
    setDateOfBirth("");
    setPatientSearch("");
  }

  function toggleProduct(product: AdminOrderProduct) {
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) return prev.filter((line) => line.productId !== product.id);
      return [
        ...prev,
        {
          productId: product.id,
          qty: 1,
          unitPriceCents: product.priceCents,
          patientInitials: "",
          sig: "",
        },
      ];
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("lines", JSON.stringify(lines));
    data.set("clinicalPatientId", patientId);
    // placeAdminOrder always redirects on success/validation — do not catch NEXT_REDIRECT.
    await placeAdminOrder(data);
  }

  return (
    <form className="ws-stack" onSubmit={onSubmit}>
      {error ? <p className="error">{error}</p> : null}

      <SectionCard
        title="1 · Practice & patient"
        description="Use an existing chart or enter a new client. New patients are created on the selected practice."
        action={
          <button className="btn btn-ghost" type="button" onClick={clearPatient}>
            New patient
          </button>
        }
      >
        <div className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <label style={{ minWidth: 240, flex: 1 }}>
            Practice
            <select name="orgId" value={orgId} onChange={(e) => setOrgId(e.target.value)} required>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.legalName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ship to
            <select name="shipDestination" defaultValue="PRACTICE">
              <option value="PRACTICE">Practice</option>
              <option value="PATIENT">Patient</option>
            </select>
          </label>
          <label>
            Payment
            <select name="paymentStatus" defaultValue="invoiced">
              <option value="invoiced">Invoiced</option>
              <option value="paid">Paid</option>
              <option value="authorized">Authorized</option>
            </select>
          </label>
        </div>

        <div className="ws-message-form" style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Search existing patients…"
            style={{ minWidth: 260, flex: 1 }}
          />
        </div>

        <div className="table-wrap" style={{ maxHeight: 180, overflow: "auto", marginTop: 8 }}>
          <table className="table">
            <tbody>
              {filteredPatients.slice(0, 20).map((patient) => (
                <tr key={patient.id}>
                  <td>
                    <button
                      type="button"
                      className="ws-text-link"
                      onClick={() => pickPatient(patient)}
                      style={{ fontWeight: patientId === patient.id ? 700 : 400 }}
                    >
                      {patient.fullName}
                    </button>
                    <div className="muted">{patient.email}</div>
                  </td>
                  <td className="muted">{patient.orgName}</td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => pickPatient(patient)}>
                      Use
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredPatients.length ? (
                <tr>
                  <td className="muted">No patients match — enter a new client below.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="ws-message-form" style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Patient name *" />
          <input name="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email *" />
          <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
          <input name="dateOfBirth" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} placeholder="DOB YYYY-MM-DD" />
        </div>
        <textarea name="notes" placeholder="Internal note (optional)" rows={2} style={{ width: "100%", marginTop: 12 }} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <input type="checkbox" name="forwardPharmacy" value="1" defaultChecked />
          Forward to pharmacy when eScript is not required
        </label>
      </SectionCard>

      <SectionCard
        title="2 · Products (full catalog)"
        description="Every active SKU is available here — including held classes. Portal checkout gates do not apply."
      >
        <div className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Search name, SKU, category…"
            style={{ minWidth: 260, flex: 1 }}
          />
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            {classes.map((klass) => (
              <option key={klass} value={klass}>
                {klass === "all" ? "All classes" : klass}
              </option>
            ))}
          </select>
        </div>

        <div className="table-wrap" style={{ maxHeight: 360, overflow: "auto", marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>SKU</th>
                <th>Name</th>
                <th>Class</th>
                <th>Wholesale</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const on = selected.has(product.id);
                return (
                  <tr key={product.id} style={on ? { background: "rgba(47, 107, 58, 0.08)" } : undefined}>
                    <td>
                      <button type="button" className={on ? "btn btn-accent" : "btn btn-ghost"} onClick={() => toggleProduct(product)}>
                        {on ? "Added" : "Add"}
                      </button>
                    </td>
                    <td>
                      <b>{product.sku}</b>
                    </td>
                    <td>{product.name}</td>
                    <td>{product.productClass}</td>
                    <td>{money(product.priceCents)}</td>
                    <td className="muted">
                      {product.rxRequired ? "Rx · " : ""}
                      {!product.orderable ? product.holdReason || "held" : "orderable"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {lines.length ? (
        <SectionCard title="3 · Lines">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit $</th>
                  <th>Initials</th>
                  <th>Sig</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const product = products.find((row) => row.id === line.productId);
                  return (
                    <tr key={line.productId}>
                      <td>
                        <b>{product?.name}</b>
                        <div className="muted">{product?.sku}</div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          style={{ width: 72 }}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.productId === line.productId
                                  ? { ...row, qty: Math.max(1, Number(e.target.value) || 1) }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={(line.unitPriceCents / 100).toFixed(2)}
                          style={{ width: 96 }}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.productId === line.productId
                                  ? {
                                      ...row,
                                      unitPriceCents: Math.round(Number(e.target.value || 0) * 100),
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line.patientInitials}
                          placeholder={product?.rxRequired ? "A.B." : "optional"}
                          style={{ width: 80 }}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.productId === line.productId
                                  ? { ...row, patientInitials: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line.sig}
                          placeholder="As directed…"
                          style={{ minWidth: 140 }}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.productId === line.productId ? { ...row, sig: e.target.value } : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setLines((prev) => prev.filter((row) => row.productId !== line.productId))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 12 }}>
            <b>{totals.count}</b> lines · subtotal <b>{money(totals.subtotal)}</b> (+ shipping at submit)
          </p>
        </SectionCard>
      ) : null}

      <button className="btn btn-accent" type="submit" disabled={pending || !lines.length || !fullName || !email}>
        {pending ? "Creating…" : "Create order"}
      </button>
    </form>
  );
}
