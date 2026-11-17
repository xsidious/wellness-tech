import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/portal/Workspace";
import { CatalogAddForm } from "@/components/portal/CatalogAddForm";
import { requireUser, rolesOf } from "@/lib/guard";
import { money } from "@/lib/money";
import { photoForClass } from "@/lib/photos";
import { submitCompoundRequest, toggleRxFavorite } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";
import { canOrder } from "@/lib/rules";

const PAGE_SIZE = 24;

const VENDOR_TABS = [
  { id: "all", label: "All products" },
  { id: "eventide", label: "Eventide" },
  { id: "prescribeusa", label: "PrescribeUSA" },
] as const;

const CLASS_TABS = [
  { id: "all", label: "All" },
  { id: "503a", label: "503A" },
  { id: "503b", label: "503B" },
  { id: "rnd", label: "R&D / RUO" },
  { id: "supplies", label: "Supplies" },
] as const;

function vendorOf(category: string) {
  if (/^PrescribeUSA/i.test(category)) return "prescribeusa";
  if (/^Eventide/i.test(category)) return "eventide";
  return "other";
}

function categoryLabel(category: string) {
  return category
    .replace(/^Eventide\s*·\s*/i, "")
    .replace(/^PrescribeUSA(?:\s*Pens)?(?:\s*·\s*)?/i, "")
    .trim() || category;
}

function matchesClassTab(tab: string, product: { productClass: string; category: string; name: string }) {
  const klass = product.productClass.toLowerCase();
  const blob = `${product.category} ${product.name}`.toLowerCase();
  if (tab === "all" || !tab) return true;
  if (tab === "503a") return klass === "503a";
  if (tab === "503b") return klass === "503b";
  if (tab === "rnd") return klass === "rnd";
  if (tab === "supplies") return klass === "supply" || /syringe|needle|pad|bag|bottle|saline/.test(blob);
  return true;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    vendor?: string;
    tab?: string;
    q?: string;
    cat?: string;
    page?: string;
    requested?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const vendor = (["all", "eventide", "prescribeusa"].includes(String(params.vendor || ""))
    ? params.vendor
    : "all") as "all" | "eventide" | "prescribeusa";
  const tab = params.tab || "all";
  const cat = (params.cat || "").trim();
  const q = (params.q || "").trim().toLowerCase();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const roles = rolesOf(user.roles);
  const hidePrice =
    user.org.hidePricingFromStaff &&
    roles.includes("staff") &&
    !roles.some((r) => ["owner", "prescriber", "billing", "admin"].includes(r));
  const showPrice = user.org.verificationTier >= 1 && !hidePrice;

  const [products, favorites, compoundRequests, patients] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.rxFavorite.findMany({ where: { orgId: user.orgId }, select: { sku: true } }),
    prisma.compoundRequest.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.clinicalPatient.findMany({
      where: { orgId: user.orgId },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
      take: 200,
    }),
  ]);

  const favSet = new Set(favorites.map((f) => f.sku));
  const otherPatients = patients.filter((p) => p.email.toLowerCase() !== user.email.toLowerCase());

  const filtered = products.filter((p) => {
    if (vendor !== "all" && vendorOf(p.category) !== vendor) return false;
    if (!matchesClassTab(tab, p)) return false;
    if (cat && categoryLabel(p.category) !== cat) return false;
    if (q && !`${p.name} ${p.sku} ${p.category} ${p.strength}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const categories = Array.from(
    new Set(filtered.map((p) => categoryLabel(p.category)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const qs = (overrides: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      vendor: vendor === "all" ? undefined : vendor,
      tab: tab === "all" ? undefined : tab,
      cat: cat || undefined,
      q: q || undefined,
      page: undefined as string | number | undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v == null || v === "" || v === "all" || v === 1) continue;
      next.set(k, String(v));
    }
    const s = next.toString();
    return s ? `?${s}` : "";
  };

  const orderableCount = filtered.filter((p) => canOrder(user.org.verificationTier, p.productClass, p.orderable).ok).length;
  const tierBlocked = user.org.verificationTier < 1;

  return (
    <div className="mk">
      <PageHeader
        kicker="Marketplace"
        title="Product catalog"
        lede="Eventide compounds and PrescribeUSA pens — search, filter, add to cart."
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

      {tierBlocked ? (
        <p className="error">
          Practice verification is required before ordering. Open Credentials or ask Wellness Tech to raise your tier.
        </p>
      ) : null}
      {params.error ? <p className="error">{params.error}</p> : null}
      {params.requested ? <p className="note">Custom compound request submitted.</p> : null}

      <div className="mk-toolbar">
        <div className="mk-vendor-row">
          {VENDOR_TABS.map((t) => (
            <Link
              key={t.id}
              href={`/portal/catalog${qs({ vendor: t.id, page: 1, cat: undefined })}`}
              className={`mk-vendor${vendor === t.id ? " active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <form className="mk-search" action="/portal/catalog" method="get">
          {vendor !== "all" ? <input type="hidden" name="vendor" value={vendor} /> : null}
          {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
          {cat ? <input type="hidden" name="cat" value={cat} /> : null}
          <input name="q" defaultValue={params.q || ""} placeholder="Search by name, strength, SKU…" />
          <button className="btn btn-accent" type="submit">
            Search
          </button>
        </form>

        <div className="mk-chip-row">
          {CLASS_TABS.map((t) => (
            <Link
              key={t.id}
              href={`/portal/catalog${qs({ tab: t.id, page: 1 })}`}
              className={`mk-chip${tab === t.id ? " active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {categories.length > 1 ? (
          <div className="mk-chip-row mk-chip-row-scroll">
            <Link href={`/portal/catalog${qs({ cat: undefined, page: 1 })}`} className={`mk-chip${!cat ? " active" : ""}`}>
              All categories
            </Link>
            {categories.slice(0, 24).map((c) => (
              <Link
                key={c}
                href={`/portal/catalog${qs({ cat: c, page: 1 })}`}
                className={`mk-chip${cat === c ? " active" : ""}`}
              >
                {c}
              </Link>
            ))}
          </div>
        ) : null}

        <p className="mk-count">
          Showing {pageItems.length} of {filtered.length} · {orderableCount} orderable
        </p>
      </div>

      {!pageItems.length ? (
        <EmptyState title="No products match" body="Try another vendor, class, or search term." />
      ) : (
        <div className="mk-grid">
          {pageItems.map((product) => {
            const gate = canOrder(user.org.verificationTier, product.productClass, product.orderable);
            const fav = favSet.has(product.sku);
            const vendorName = vendorOf(product.category) === "prescribeusa" ? "PrescribeUSA" : "Eventide";
            return (
              <article className="mk-card" key={product.id}>
                <div className="mk-card-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.imageUrl || photoForClass(product.productClass, product.category)}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  <div className="mk-card-badges">
                    <span className="mk-badge">{vendorName}</span>
                    <span className="mk-badge mk-badge-soft">{product.productClass}</span>
                    {product.rxRequired ? <span className="mk-badge mk-badge-rx">Rx</span> : null}
                  </div>
                </div>
                <div className="mk-card-body">
                  <p className="mk-card-cat">{categoryLabel(product.category)}</p>
                  <h3>{product.name}</h3>
                  <p className="mk-card-meta">
                    {[product.strength, product.form, product.size].filter(Boolean).join(" · ") || "Formulary item"}
                  </p>
                  <div className="mk-card-price-row">
                    <strong className="mk-price">
                      {!showPrice ? "—" : product.priceCents ? money(product.priceCents) : "Ask"}
                    </strong>
                    {fav ? <StatusBadge tone="ok">Favorite</StatusBadge> : null}
                  </div>

                  {gate.ok ? (
                    <CatalogAddForm
                      compact
                      productId={product.id}
                      rxRequired={product.rxRequired}
                      selfLabel={user.name}
                      patients={otherPatients}
                    />
                  ) : (
                    <p className="mk-blocked">{product.holdReason || gate.reason}</p>
                  )}

                  <div className="mk-card-foot">
                    <Link href={`/portal/catalog/${encodeURIComponent(product.sku)}`} className="ws-text-link">
                      Details
                    </Link>
                    <form action={toggleRxFavorite}>
                      <input type="hidden" name="sku" value={product.sku} />
                      <input type="hidden" name="name" value={product.name} />
                      <input
                        type="hidden"
                        name="next"
                        value={`/portal/catalog${qs({ page: safePage })}`}
                      />
                      <button className="btn btn-ghost" type="submit">
                        {fav ? "Unfavorite" : "Favorite"}
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mk-pager">
          {safePage > 1 ? (
            <Link className="btn btn-ghost" href={`/portal/catalog${qs({ page: safePage - 1 })}`}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">
            Page {safePage} / {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link className="btn btn-ghost" href={`/portal/catalog${qs({ page: safePage + 1 })}`}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}

      <details className="mk-request">
        <summary>Don&apos;t see it? Request a custom compound</summary>
        <form action={submitCompoundRequest} className="mk-request-form">
          <input name="name" required placeholder="Compound name" />
          <input name="strength" placeholder="Strength" />
          <input name="form" placeholder="Form" />
          <input name="note" placeholder="Clinical note" />
          <button className="btn btn-accent" type="submit">
            Submit request
          </button>
        </form>
        {compoundRequests.length ? (
          <ul className="mk-request-list">
            {compoundRequests.map((r) => (
              <li key={r.id}>
                {r.name} · {r.status} · {r.createdAt.toLocaleDateString()}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}
