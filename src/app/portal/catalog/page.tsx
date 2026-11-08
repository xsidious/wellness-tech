import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/portal/Workspace";
import { addToCart } from "@/lib/actions";
import { requireUser, rolesOf } from "@/lib/guard";
import { money } from "@/lib/money";
import { photoForClass } from "@/lib/photos";
import { submitCompoundRequest, toggleRxFavorite } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";
import { canOrder, isProductClass } from "@/lib/rules";

const TABS = [
  { id: "all", label: "All" },
  { id: "503a", label: "503A" },
  { id: "503b", label: "503B" },
  { id: "puo", label: "PUO / Office" },
  { id: "lab", label: "Lab Kits" },
  { id: "supplies", label: "Supplies" },
] as const;

function matchesTab(tab: string, product: { productClass: string; category: string; officeUse: boolean; name: string }) {
  const klass = product.productClass.toLowerCase();
  const blob = `${product.category} ${product.name}`.toLowerCase();
  if (tab === "all" || !tab) return true;
  if (tab === "503a") return klass === "503a";
  if (tab === "503b") return klass === "503b";
  if (tab === "puo") return product.officeUse || klass === "device";
  if (tab === "lab") return /lab|kit|diagnostic|exosome/.test(`${klass} ${blob}`);
  if (tab === "supplies") return klass === "supply" || /syringe|needle|pad|bag|bottle/.test(blob);
  return true;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string; class?: string; tab?: string; q?: string; requested?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const office = params.office === "1";
  const classFilter = params.class || "";
  const tab = params.tab || (office ? "puo" : "all");
  const q = (params.q || "").trim().toLowerCase();
  const roles = rolesOf(user.roles);
  const hidePrice =
    user.org.hidePricingFromStaff &&
    roles.includes("staff") &&
    !roles.some((r) => ["owner", "prescriber", "billing", "admin"].includes(r));
  const showPrice = user.org.verificationTier >= 1 && !hidePrice;

  const [products, favorites, compoundRequests] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        ...(office ? { officeUse: true } : {}),
        ...(classFilter ? { productClass: classFilter } : {}),
      },
      orderBy: { name: "asc" },
    }),
    prisma.rxFavorite.findMany({ where: { orgId: user.orgId }, select: { sku: true } }),
    prisma.compoundRequest.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const favSet = new Set(favorites.map((f) => f.sku));
  const filtered = products.filter((p) => matchesTab(tab, p) && (!q || `${p.name} ${p.sku}`.toLowerCase().includes(q)));
  const classes = Array.from(new Set(products.map((p) => p.productClass).filter(Boolean)));

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Marketplace"
        title={office ? "Office stock" : "Marketplace"}
        lede="Browse the catalog and add items to your cart. Need a custom formulation? Request a compound below."
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/portal/price-list">
              Price list
            </Link>
            <Link className="btn btn-accent" href="/portal/cart">
              Cart
            </Link>
          </div>
        }
      />
      {params.requested ? <p className="note">Custom compound request submitted to Wellness Tech.</p> : null}

      <SectionCard title="Don't see it? Request a custom compound" description="Ask a compounding pharmacy to formulate something that isn't in the catalog yet.">
        <form action={submitCompoundRequest} className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="name" required placeholder="Compound name" style={{ minWidth: 180 }} />
          <input name="strength" placeholder="Strength" />
          <input name="form" placeholder="Form (inj, troche…)" />
          <input name="note" placeholder="Clinical note" style={{ minWidth: 200 }} />
          <button className="btn btn-accent" type="submit">
            Request compound
          </button>
        </form>
        {compoundRequests.length ? (
          <ul style={{ marginTop: 12 }}>
            {compoundRequests.slice(0, 5).map((r) => (
              <li key={r.id}>
                {r.name} · {r.status} · {r.createdAt.toLocaleDateString()}
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      <div className="ws-filter-row">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/portal/catalog?tab=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`ws-filter${tab === t.id ? " active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={params.q || ""} placeholder="Search products…" style={{ minWidth: 260 }} />
        <button className="btn btn-ghost" type="submit">
          Search
        </button>
      </form>

      <div className="ws-filter-row">
        <Link href={`/portal/catalog?tab=${tab}`} className={`ws-filter${!classFilter ? " active" : ""}`}>
          All classes
        </Link>
        {classes.map((klass) => (
          <Link
            key={klass}
            href={`/portal/catalog?tab=${tab}&class=${encodeURIComponent(klass)}`}
            className={`ws-filter${classFilter === klass ? " active" : ""}`}
          >
            {klass}
          </Link>
        ))}
      </div>

      {!filtered.length ? (
        <EmptyState title="No products" body="No active SKUs match this filter." />
      ) : (
        <div className="ws-catalog-grid">
          {filtered.map((product) => {
            const gate = isProductClass(product.productClass)
              ? canOrder(user.org.verificationTier, product.productClass, product.orderable)
              : { ok: false, reason: "Unknown class." };
            const fav = favSet.has(product.sku);
            return (
              <article className="ws-product" key={product.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ws-product-photo"
                  src={photoForClass(product.productClass, product.category)}
                  alt=""
                />
                <div className="ws-product-body">
                  <div className="ws-chip-row">
                    <span className="ws-chip">{product.category || product.form || product.productClass}</span>
                    {product.rxRequired ? <StatusBadge tone="info">Rx</StatusBadge> : null}
                    {product.officeUse ? <StatusBadge tone="neutral">Office</StatusBadge> : null}
                    {fav ? <StatusBadge tone="ok">Favorite</StatusBadge> : null}
                  </div>
                  <h3>{product.name}</h3>
                  <p className="muted">{product.description || "Formulary item"}</p>
                  <p className="ws-product-meta">
                    {!showPrice
                      ? "Price hidden"
                      : product.priceCents
                        ? money(product.priceCents)
                        : "Price not set"}
                    {" · "}
                    {product.storage === "cold" ? "Cold chain" : "Ambient"}
                  </p>
                  {gate.ok ? (
                    <form action={addToCart} className="ws-product-form">
                      <input type="hidden" name="productId" value={product.id} />
                      <label>
                        Qty
                        <input name="qty" type="number" min={1} defaultValue={1} />
                      </label>
                      {product.rxRequired ? (
                        <>
                          <label>
                            Patient initials
                            <input name="initials" placeholder="A.B." required />
                          </label>
                          <label>
                            Sig for the prescriber
                            <input name="sig" placeholder="As directed by prescriber" required />
                          </label>
                        </>
                      ) : null}
                      <button className="btn btn-accent" type="submit">
                        Add to order
                      </button>
                    </form>
                  ) : (
                    <p className="error">{product.holdReason || gate.reason}</p>
                  )}
                  <div className="ws-head-actions">
                    <Link href={`/portal/catalog/${product.sku}`} className="ws-text-link">
                      View details
                    </Link>
                    <form action={toggleRxFavorite}>
                      <input type="hidden" name="sku" value={product.sku} />
                      <input type="hidden" name="name" value={product.name} />
                      <input type="hidden" name="next" value={`/portal/catalog?tab=${tab}`} />
                      <button className="btn btn-ghost" type="submit">
                        {fav ? "Unfavorite" : "Rx favorite"}
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SectionCard title="Need the spreadsheet view?">
        <p className="muted">Use the organized formulary price list for class-by-class pricing without product cards.</p>
        <Link className="btn btn-ghost" href="/portal/price-list">
          Open price list
        </Link>
      </SectionCard>
    </div>
  );
}
