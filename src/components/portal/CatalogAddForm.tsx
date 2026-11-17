import { addToCart } from "@/lib/actions";

type PatientOption = { id: string; fullName: string; email: string };

export function CatalogAddForm({
  productId,
  rxRequired,
  selfLabel,
  patients,
  compact = false,
}: {
  productId: string;
  rxRequired: boolean;
  selfLabel: string;
  patients: PatientOption[];
  compact?: boolean;
}) {
  return (
    <form action={addToCart} className={compact ? "mk-add" : "ws-product-form"}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="sig" value="As directed by prescribing clinician." />
      {rxRequired ? (
        <label className="mk-add-field">
          <span className="mk-add-label">Patient</span>
          <select name="clinicalPatientId" defaultValue="self" required>
            <option value="self">Myself · {selfLabel}</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="clinicalPatientId" value="self" />
      )}
      <label className="mk-add-field mk-add-qty">
        <span className="mk-add-label">Qty</span>
        <input name="qty" type="number" min={1} defaultValue={1} />
      </label>
      <button className="btn btn-accent mk-add-btn" type="submit">
        Add to cart
      </button>
    </form>
  );
}
