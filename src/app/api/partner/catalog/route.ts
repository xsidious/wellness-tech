import { NextResponse } from "next/server";
import { partnerSecretOk } from "@/lib/partner-org";
import { prisma } from "@/lib/prisma";

/** Partner clinic catalog pull (Threefold / 4everglow / Facial Design / KIAN). */
export async function GET(request: Request) {
  if (!partnerSecretOk(request.headers.get("x-wt-partner-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { active: true, orderable: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 500,
  });

  return NextResponse.json({
    ok: true,
    site: request.headers.get("x-wt-partner-site") || "",
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      platformProductId: p.rxcoreFormularyId || p.id,
      name: p.name,
      productClass: p.productClass,
      category: p.category,
      form: p.form,
      strength: p.strength,
      size: p.size,
      storage: p.storage,
      rxRequired: p.rxRequired,
      officeUse: p.officeUse,
      priceCents: p.priceCents,
      description: p.description,
    })),
  });
}
