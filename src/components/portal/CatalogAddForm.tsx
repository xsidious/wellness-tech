"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCart } from "@/lib/actions";
import { OPEN_CATALOG_SIDE_CART } from "@/components/portal/catalog-cart-events";

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
  /** @deprecated Soft add no longer navigates; kept for call-site compatibility. */
  returnTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <form
      className={compact ? "mk-add" : "ws-product-form"}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await addToCart(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          try {
            sessionStorage.setItem("wt-open-catalog-cart", "1");
          } catch {
            // ignore
          }
          window.dispatchEvent(new Event(OPEN_CATALOG_SIDE_CART));
          // Product detail has no side cart — land on marketplace with drawer open.
          if (/\/portal\/catalog\/[^/]+/.test(window.location.pathname)) {
            router.push("/portal/catalog?cart=1");
          } else {
            router.refresh();
          }
        });
      }}
    >
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
      <button className="btn btn-accent mk-add-btn" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add to cart"}
      </button>
      {error ? <p className="error mk-add-error">{error}</p> : null}
    </form>
  );
}
