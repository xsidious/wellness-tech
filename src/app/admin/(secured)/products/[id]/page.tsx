import { notFound } from "next/navigation";
import { saveProduct } from "@/lib/actions";
import { prisma } from "@/lib/prisma";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const product = await prisma.product.findUnique({ where: { id: (await params).id } });
  if (!product) notFound();
  return (
    <>
      <h1>Edit {product.sku}</h1>
      <form className="form" action={saveProduct}>
        <input type="hidden" name="id" value={product.id} />
        <label>Name<input name="name" defaultValue={product.name} /></label>
        <label>Description<textarea name="description" defaultValue={product.description} /></label>
        <label>Price in dollars<input name="price" defaultValue={(product.priceCents / 100).toFixed(2)} /></label>
        <label style={{ flexDirection: "row" }}><input type="checkbox" name="active" defaultChecked={product.active} /> Active</label>
        <label style={{ flexDirection: "row" }}><input type="checkbox" name="orderable" defaultChecked={product.orderable} /> Orderable</label>
        <label>Hold reason<input name="holdReason" defaultValue={product.holdReason} /></label>
        <button className="btn btn-accent">Save product</button>
      </form>
    </>
  );
}
