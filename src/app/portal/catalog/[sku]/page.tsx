import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogAddForm } from "@/components/portal/CatalogAddForm";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { photoForClass } from "@/lib/photos";
import { prisma } from "@/lib/prisma";
import { canOrder } from "@/lib/rules";

export default async function ProductDetail({ params }: { params: Promise<{ sku: string }> }) {
  const user = await requireUser();
  const sku = decodeURIComponent((await params).sku);
  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) notFound();

  const patients = await prisma.clinicalPatient.findMany({
    where: { orgId: user.orgId },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
    take: 200,
  });
  const otherPatients = patients.filter((p) => p.email.toLowerCase() !== user.email.toLowerCase());
  const gate = canOrder(user.org.verificationTier, product.productClass, product.orderable);

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
      <p className="mk-price">{product.priceCents ? money(product.priceCents) : "Ask for price"}</p>
      {gate.ok ? (
        <CatalogAddForm
          compact
          productId={product.id}
          rxRequired={product.rxRequired}
          selfLabel={user.name}
          patients={otherPatients}
        />
      ) : (
        <p className="error">{product.holdReason || gate.reason}</p>
      )}
    </div>
  );
}
