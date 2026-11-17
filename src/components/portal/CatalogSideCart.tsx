"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { removeCartItem } from "@/lib/actions";
import { money } from "@/lib/money";

export type SideCartLine = {
  id: string;
  qty: number;
  patientInitials: string;
  name: string;
  sku: string;
  priceCents: number;
  imageUrl: string;
};

export function CatalogSideCart({
  lines,
  subtotalCents,
  shippingCents,
  initialOpen = false,
}: {
  lines: SideCartLine[];
  subtotalCents: number;
  shippingCents: number;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, [initialOpen, lines.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="btn btn-accent" onClick={() => setOpen(true)}>
        Cart{count ? ` (${count})` : ""}
      </button>

      <div className={`mk-sidecart${open ? " open" : ""}`} aria-hidden={!open}>
        <button
          type="button"
          className="mk-sidecart-backdrop"
          aria-label="Close cart"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
        />
        <aside className="mk-sidecart-panel" role="dialog" aria-modal="true" aria-label="Shopping cart">
          <header className="mk-sidecart-head">
            <div>
              <p className="mk-sidecart-kicker">Cart</p>
              <h2>{count ? `${count} item${count === 1 ? "" : "s"}` : "Empty"}</h2>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>

          <div className="mk-sidecart-body">
            {!lines.length ? (
              <p className="mk-sidecart-empty">Add products from the marketplace — your cart stays here.</p>
            ) : (
              <ul className="mk-sidecart-list">
                {lines.map((line) => (
                  <li key={line.id} className="mk-sidecart-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={line.imageUrl} alt="" referrerPolicy="no-referrer" />
                    <div className="mk-sidecart-line-main">
                      <strong>{line.name}</strong>
                      <span>
                        Qty {line.qty}
                        {line.patientInitials ? ` · ${line.patientInitials}` : ""}
                      </span>
                      <span className="mk-sidecart-price">{money(line.priceCents * line.qty)}</span>
                    </div>
                    <form action={removeCartItem}>
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="returnTo" value="/portal/catalog?cart=1" />
                      <button className="btn btn-ghost mk-sidecart-remove" type="submit">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="mk-sidecart-foot">
            {lines.length ? (
              <>
                <div className="mk-sidecart-totals">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(subtotalCents)}</strong>
                  </div>
                  <div>
                    <span>Shipping</span>
                    <strong>{money(shippingCents)}</strong>
                  </div>
                  <div className="mk-sidecart-total">
                    <span>Total</span>
                    <strong>{money(subtotalCents + shippingCents)}</strong>
                  </div>
                </div>
                <Link className="btn btn-accent mk-sidecart-checkout" href="/portal/checkout">
                  Checkout
                </Link>
                <Link className="ws-text-link" href="/portal/cart" onClick={() => setOpen(false)}>
                  Full cart page
                </Link>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Keep browsing
              </button>
            )}
          </footer>
        </aside>
      </div>
    </>
  );
}
