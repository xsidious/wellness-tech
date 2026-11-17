import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogAddForm } from "@/components/portal/CatalogAddForm";
import { buildCatalogCompareIndex, peerPriceForProduct } from "@/lib/catalog-compare";
import { requireUser, rolesOf } from "@/lib/guard";
import { money } from "@/lib/money";
import { photoForClass } from "@/lib/photos";
import { prisma } from "@/lib/prisma";
import { canOrder } from "@/lib/rules";

export default async function ProductDetail({ params }: { params: Promise<{ sku: string }> }) {
  const user = await requireUser();
  const sku = decodeURIComponent((await params).sku);
  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) notFound();

  const roles = rolesOf(user.roles);
  const hidePrice =
    user.org.hidePricingFromStaff &&
    roles.includes("staff") &&
    !roles.some((r) => ["owner", "prescriber", "billing", "admin"].includes(r));
  const showPrice = user.org.verificationTier >= 1 && !hidePrice;

  const [patients, peers] = await Promise.all([
    prisma.clinicalPatient.findMany({
      where: { orgId: user.orgId },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
      take: 200,
    }),
    prisma.product.findMany({
      where: { active: true, orderable: true },
      select: {
        sku: true,
        name: true,
        strength: true,
        priceCents: true,
        category: true,
        rxcoreFormularyId: true,
      },
    }),
  ]);
  const otherPatients = patients.filter((p) => p.email.toLowerCase() !== user.email.toLowerCase());
  const gate = canOrder(user.org.verificationTier, product.productClass, product.orderable, {
    sku: product.sku,
    category: product.category,
    rxcoreFormularyId: product.rxcoreFormularyId,
  });
  const peer = showPrice ? peerPriceForProduct(product, buildCatalogCompareIndex(peers)) : null;

  return (
    <div className="mk" style={{ maxWidth: 720 }}>
      <Link href="/portal/catalog" className="ws-text-link">
        ← Back to marketplace
      </Link>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="dash-photo"
        src={product.imageUrl || photoForClass(product.productClass, product.category)}
        alt=""
        referrerPolicy="no-referrer"
        style={{ borderRadius: 18, marginTop: 12 }}
      />
      <p className="kicker">{product.category || product.productClass}</p>
      <h1>{product.name}</h1>
      {product.form ? <p>{product.form}</p> : null}
      <p>{product.description}</p>
      <p>
        SKU {product.sku.slice(0, 12)}… · {product.productClass}
        {product.strength ? ` · ${product.strength}` : ""}
      </p>
      <div className="mk-price-stack">
        <p className="mk-price">{showPrice && product.priceCents ? money(product.priceCents) : "Ask for price"}</p>
        {peer ? (
          <p
            className={`mk-price-peer${peer.cheaper === peer.peerVendor ? " mk-price-peer-cheaper" : ""}`}
          >
            Also on {peer.peerVendor === "prescribeusa" ? "PrescribeUSA" : "Eventide"}: {money(peer.peerPriceCents)}
            {peer.cheaper === peer.peerVendor ? " (cheaper)" : ""}
            {" · "}
            <Link className="ws-text-link" href={`/portal/catalog/${encodeURIComponent(peer.peerSku)}`}>
              View peer
            </Link>
          </p>
        ) : null}
      </div>
      {gate.ok ? (
        <CatalogAddForm
          compact
          productId={product.id}
          rxRequired={product.rxRequired}
          selfLabel={user.name}
          patients={otherPatients}
          returnTo="/portal/catalog?cart=1"
        />
      ) : (
        <p className="error">{product.holdReason || gate.reason}</p>
      )}
    </div>
  );
}
