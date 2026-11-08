import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

function csvEscape(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/portal/orders", req.url));
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const status = searchParams.get("status") || "";
  const escript = searchParams.get("escript") || "";
  const payment = searchParams.get("payment") || "";

  const orders = await prisma.order.findMany({
    where: {
      orgId: user.orgId,
      ...(status ? { status } : {}),
      ...(escript ? { escriptStatus: escript } : {}),
      ...(payment ? { paymentStatus: payment } : {}),
      ...(q
        ? {
            OR: [
              { invoiceNumber: { contains: q, mode: "insensitive" } },
              { partnerExternalRef: { contains: q, mode: "insensitive" } },
              { trackingNumber: { contains: q, mode: "insensitive" } },
              { clinicalPatient: { fullName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { clinicalPatient: true, pharmacy: true, lines: true },
  });

  const header = [
    "invoice",
    "status",
    "payment",
    "escript",
    "patient",
    "pharmacy",
    "tracking",
    "lines",
    "subtotal_cents",
    "shipping_cents",
    "total_cents",
    "created_at",
  ];
  const rows = orders.map((o) =>
    [
      o.invoiceNumber,
      o.status,
      o.paymentStatus,
      o.escriptStatus,
      o.clinicalPatient?.fullName || "",
      o.pharmacy?.name || "",
      o.trackingNumber || "",
      o.lines.length,
      o.subtotalCents,
      o.shippingFeeCents,
      o.totalCents,
      o.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(","),
  );

  const body = [header.join(","), ...rows].join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${user.orgId.slice(0, 8)}.csv"`,
    },
  });
}
