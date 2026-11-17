import { notFound, redirect } from "next/navigation";
import { addToCartAndRedirect } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function EducationItem({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const item = await prisma.contentItem.findUnique({ where: { slug: (await params).slug } });
  if (!item) notFound();
  if (user.org.verificationTier < item.accessTier) redirect("/portal/education");
  const product = item.protocolSku ? await prisma.product.findUnique({ where: { sku: item.protocolSku } }) : null;
  return (
    <>
      <p className="kicker">Version {item.version}</p>
      <h1>{item.title}</h1>
      <p>{item.body}</p>
      {product ? (
        <form action={addToCartAndRedirect} className="form">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="qty" value="1" />
          <label>Patient initials for review<input name="initials" placeholder="A.B." required /></label>
          <button className="btn btn-accent">Add protocol to cart for review</button>
        </form>
      ) : null}
    </>
  );
}
