"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const user = await requireUser();
  if (!rolesOf(user.roles).includes("admin")) throw new Error("Admin only");
  return user;
}

function listField(formData: FormData, key: string) {
  return JSON.stringify(
    String(formData.get(key) || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function upsertPharmacy(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name required");

  const data = {
    name,
    legalName: String(formData.get("legalName") || "").trim(),
    type: String(formData.get("type") || "Hybrid").trim(),
    region: String(formData.get("region") || "").trim(),
    status: String(formData.get("status") || "online").trim(),
    description: String(formData.get("description") || "").trim(),
    sla: String(formData.get("sla") || "").trim(),
    contactName: String(formData.get("contactName") || "").trim(),
    contactEmail: String(formData.get("contactEmail") || "").trim().toLowerCase(),
    phone: String(formData.get("phone") || "").trim(),
    website: String(formData.get("website") || "").trim(),
    licenseNumber: String(formData.get("licenseNumber") || "").trim(),
    licenseState: String(formData.get("licenseState") || "").trim().toUpperCase().slice(0, 2),
    npi: String(formData.get("npi") || "").trim(),
    deaNumber: String(formData.get("deaNumber") || "").trim(),
    ncpdpId: String(formData.get("ncpdpId") || "").trim(),
    street1: String(formData.get("street1") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim().toUpperCase().slice(0, 2),
    zip: String(formData.get("zip") || "").trim(),
    hours: String(formData.get("hours") || "").trim(),
    coldChain: formData.get("coldChain") === "on",
    patientShip: formData.get("patientShip") === "on",
    practiceShip: formData.get("practiceShip") === "on",
    internalNotes: String(formData.get("internalNotes") || "").trim(),
    specialtiesJson: listField(formData, "specialties"),
    capabilitiesJson: listField(formData, "capabilities"),
    erpJson: listField(formData, "erp"),
    statesServedJson: listField(formData, "statesServed"),
    shippingModesJson: listField(formData, "shippingModes"),
  };

  const pharmacy = id
    ? await prisma.pharmacy.update({ where: { id }, data })
    : await prisma.pharmacy.create({ data });

  // Keep a matching HQ location in sync when address is provided.
  if (data.street1 || data.city) {
    const existingDefault = await prisma.pharmacyLocation.findFirst({
      where: { pharmacyId: pharmacy.id, isDefault: true },
    });
    if (existingDefault) {
      await prisma.pharmacyLocation.update({
        where: { id: existingDefault.id },
        data: {
          label: existingDefault.label || "HQ",
          street1: data.street1,
          city: data.city,
          state: data.state,
          zip: data.zip,
        },
      });
    } else {
      await prisma.pharmacyLocation.create({
        data: {
          pharmacyId: pharmacy.id,
          label: "HQ",
          street1: data.street1,
          city: data.city,
          state: data.state,
          zip: data.zip,
          isDefault: true,
        },
      });
    }
  }

  await audit({
    actorId: user.id,
    action: id ? "pharmacy.update" : "pharmacy.create",
    object: `pharmacy:${pharmacy.id}`,
    after: pharmacy.name,
  });

  revalidatePath("/admin/pharmacies");
  revalidatePath(`/admin/pharmacies/${pharmacy.id}`);
  revalidatePath("/portal/pharmacies");
  revalidatePath("/pharmacy/profile");
  redirect(`/admin/pharmacies/${pharmacy.id}`);
}

export async function createSettlement(formData: FormData) {
  const user = await requireAdmin();
  const kind = String(formData.get("kind") || "practice");
  const orgId = String(formData.get("orgId") || "") || null;
  const periodStart = new Date(String(formData.get("periodStart") || Date.now()));
  const periodEnd = new Date(String(formData.get("periodEnd") || Date.now()));

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      createdAt: { gte: periodStart, lte: periodEnd },
      ...(orgId ? { orgId } : {}),
    },
    take: 500,
  });

  const totalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const settlement = await prisma.settlement.create({
    data: {
      orgId,
      kind,
      periodStart,
      periodEnd,
      status: "open",
      totalCents,
      notes: String(formData.get("notes") || ""),
      lines: {
        create: orders.map((o) => ({
          orderId: o.id,
          label: o.invoiceNumber,
          amountCents: o.totalCents,
        })),
      },
    },
  });

  await audit({
    actorId: user.id,
    action: "settlement.create",
    object: `settlement:${settlement.id}`,
    after: `${orders.length} lines`,
  });

  revalidatePath("/admin/settlements");
  redirect(`/admin/settlements/${settlement.id}`);
}

export async function closeSettlement(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.settlement.update({
    where: { id },
    data: { status: "closed", closedAt: new Date() },
  });
  await audit({ actorId: user.id, action: "settlement.close", object: `settlement:${id}` });
  revalidatePath("/admin/settlements");
  revalidatePath(`/admin/settlements/${id}`);
}

export async function upsertConnectedSite(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  const slug = String(formData.get("slug") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  const displayName = String(formData.get("displayName") || "").trim();
  if (!slug || !displayName) throw new Error("Slug and display name required");

  const data = {
    slug,
    displayName,
    kind: String(formData.get("kind") || "storefront").trim() || "storefront",
    baseUrl: String(formData.get("baseUrl") || "").trim().replace(/\/$/, ""),
    sourceKey: String(formData.get("sourceKey") || slug).trim() || slug,
    status: String(formData.get("status") || "active").trim() || "active",
    statusWebhookPath: String(formData.get("statusWebhookPath") || "/api/webhooks/wellness-tech-order").trim(),
    overviewPath: String(formData.get("overviewPath") || "/api/webhooks/wellness-tech-overview").trim(),
    healthPath: String(formData.get("healthPath") || "/").trim() || "/",
    secretEnvKey: String(formData.get("secretEnvKey") || "WT_PARTNER_ORDER_SECRET").trim(),
    notes: String(formData.get("notes") || "").trim(),
  };

  const site = id
    ? await prisma.connectedSite.update({ where: { id }, data })
    : await prisma.connectedSite.create({ data });

  await audit({
    actorId: user.id,
    action: id ? "connected_site.update" : "connected_site.create",
    object: `site:${site.id}`,
    after: site.slug,
  });

  const { refreshConnectedSite } = await import("@/lib/connected-sites");
  await refreshConnectedSite(site.id).catch(() => null);

  revalidatePath("/admin/sites");
  revalidatePath(`/admin/sites/${site.id}`);
  revalidatePath("/admin");
  redirect(`/admin/sites/${site.id}`);
}

export async function setConnectedSiteStatus(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "active").trim();
  await prisma.connectedSite.update({ where: { id }, data: { status } });
  await audit({ actorId: user.id, action: "connected_site.status", object: `site:${id}`, after: status });
  revalidatePath("/admin/sites");
  revalidatePath(`/admin/sites/${id}`);
}

export async function refreshConnectedSiteAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  const { refreshConnectedSite } = await import("@/lib/connected-sites");
  await refreshConnectedSite(id);
  await audit({ actorId: user.id, action: "connected_site.refresh", object: `site:${id}` });
  revalidatePath("/admin/sites");
  revalidatePath(`/admin/sites/${id}`);
  redirect(`/admin/sites/${id}?refreshed=1`);
}

export async function refreshAllConnectedSitesAction() {
  const user = await requireAdmin();
  const { ensureConnectedSites, refreshConnectedSite } = await import("@/lib/connected-sites");
  const sites = await ensureConnectedSites();
  for (const site of sites) {
    await refreshConnectedSite(site.id).catch((error) => {
      console.error("site refresh failed", site.slug, error);
    });
  }
  await audit({ actorId: user.id, action: "connected_site.refresh_all", object: `sites:${sites.length}` });
  revalidatePath("/admin/sites");
  revalidatePath("/admin");
  redirect("/admin/sites?refreshed=1");
}

type AdminOrderLineInput = {
  productId: string;
  qty: number;
  unitPriceCents?: number;
  patientInitials?: string;
  sig?: string;
  daysSupply?: number;
};

/** Admin desk: place an order for any practice/patient with the full catalog. */
export async function placeAdminOrder(formData: FormData) {
  const admin = await requireAdmin();
  const { canAdminOrder, fulfillmentGroups, isProductClass, requiresEscript, shippingCents, routeSource } =
    await import("@/lib/rules");
  const { ensurePharmacyNetwork } = await import("@/lib/ensure-pharmacies");
  const { openRxcoreOrder } = await import("@/lib/rxcore");
  const { ensureKianPartnerOrg } = await import("@/lib/partner-org");

  let orgId = String(formData.get("orgId") || "").trim();
  const clinicalPatientId = String(formData.get("clinicalPatientId") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") || "").trim();
  const shipDestination =
    String(formData.get("shipDestination") || "PRACTICE").toUpperCase() === "PATIENT" ? "PATIENT" : "PRACTICE";
  const paymentStatus = String(formData.get("paymentStatus") || "invoiced").trim() || "invoiced";
  const notes = String(formData.get("notes") || "").trim();
  const forwardPharmacy = formData.get("forwardPharmacy") === "1" || formData.get("forwardPharmacy") === "on";

  let lines: AdminOrderLineInput[] = [];
  try {
    lines = JSON.parse(String(formData.get("lines") || "[]")) as AdminOrderLineInput[];
  } catch {
    redirect("/admin/orders/new?error=Invalid+line+items");
  }
  lines = lines
    .map((line) => ({
      productId: String(line.productId || "").trim(),
      qty: Math.max(1, Number(line.qty) || 1),
      unitPriceCents: line.unitPriceCents != null ? Math.round(Number(line.unitPriceCents)) : undefined,
      patientInitials: String(line.patientInitials || "").trim(),
      sig: String(line.sig || "").trim(),
      daysSupply: Math.max(0, Number(line.daysSupply) || 0),
    }))
    .filter((line) => line.productId);

  if (!lines.length) redirect("/admin/orders/new?error=Add+at+least+one+product");
  if (!email.includes("@")) redirect("/admin/orders/new?error=Valid+email+required");
  if (!fullName && !clinicalPatientId) redirect("/admin/orders/new?error=Patient+name+required");

  if (!orgId) {
    const partner = await ensureKianPartnerOrg();
    orgId = partner.org.id;
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) redirect("/admin/orders/new?error=Practice+not+found");

  const products = await prisma.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) } },
  });
  if (products.length !== lines.length) {
    redirect("/admin/orders/new?error=One+or+more+products+are+invalid");
  }
  const byId = new Map(products.map((product) => [product.id, product]));

  for (const line of lines) {
    const product = byId.get(line.productId)!;
    const gate = canAdminOrder(product.active);
    if (!gate.ok) redirect(`/admin/orders/new?error=${encodeURIComponent(gate.reason)}`);
    if (!isProductClass(product.productClass)) {
      redirect(`/admin/orders/new?error=${encodeURIComponent(`Unknown class on ${product.sku}`)}`);
    }
    if (product.rxRequired && (line.patientInitials || "").length < 2) {
      redirect(
        `/admin/orders/new?error=${encodeURIComponent(`${product.name} needs patient initials`)}`,
      );
    }
  }

  let patient = clinicalPatientId
    ? await prisma.clinicalPatient.findUnique({ where: { id: clinicalPatientId } })
    : null;

  if (patient && patient.orgId !== orgId) {
    redirect("/admin/orders/new?error=Patient+belongs+to+another+practice");
  }

  if (!patient) {
    const kianIntakeId = `admin:${Date.now()}`;
    patient = await prisma.clinicalPatient.create({
      data: {
        orgId,
        email,
        fullName: fullName || email,
        phone,
        dateOfBirth,
        allergies: "NKDA",
        kianIntakeId,
        sourceSite: "admin-desk",
        intakeStatus: "admin_created",
        statusNote: notes || "Created from admin order desk",
        addressJson: "{}",
        programsJson: "[]",
        intakePayloadJson: "{}",
        signaturesJson: "[]",
        therapyJson: "{}",
        clinicalChartJson: JSON.stringify({ source: "admin_order_desk" }),
      },
    });
  } else {
    patient = await prisma.clinicalPatient.update({
      where: { id: patient.id },
      data: {
        fullName: fullName || patient.fullName,
        phone: phone || patient.phone,
        dateOfBirth: dateOfBirth || patient.dateOfBirth,
        email: email || patient.email,
      },
    });
  }

  const classes: string[] = [];
  let subtotal = 0;
  let needsEscript = false;
  const storages: string[] = [];
  const lineCreates = lines.map((line) => {
    const product = byId.get(line.productId)!;
    const unit =
      line.unitPriceCents != null && line.unitPriceCents >= 0 ? line.unitPriceCents : product.priceCents;
    subtotal += unit * line.qty;
    storages.push(product.storage);
    classes.push(product.productClass);
    if (requiresEscript(product.productClass, product.rxRequired)) needsEscript = true;
    const initials =
      line.patientInitials ||
      patient!.fullName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 3);
    return {
      sku: product.sku,
      name: product.name,
      productClass: product.productClass,
      qty: line.qty,
      unitPriceCents: unit,
      patientInitials: initials,
      prescriber: admin.name,
      sig: line.sig || "As directed by prescribing clinician.",
      daysSupply: line.daysSupply || (product.rxRequired ? 30 : 0),
      strength: product.strength,
      size: product.size,
      dosageForm: product.form,
      routedSource: isProductClass(product.productClass) ? routeSource(product.productClass) : "Held",
    };
  });

  const pharmacies = await ensurePharmacyNetwork();
  const eventide = pharmacies.find((p) => /eventide/i.test(p.name)) || pharmacies[0];
  const shipping = shippingCents(storages);
  const split = fulfillmentGroups(classes);
  const count = await prisma.order.count();
  const order = await prisma.order.create({
    data: {
      orgId,
      placedById: admin.id,
      clinicalPatientId: patient.id,
      pharmacyId: eventide?.id,
      invoiceNumber: `WT-ADMIN-${String(count + 1).padStart(4, "0")}`,
      status: needsEscript ? "on_hold" : "submitted",
      paymentStatus,
      paymentToken: `admin_${admin.id.slice(0, 8)}`,
      cardLast4: "admin",
      shippingFeeCents: shipping,
      subtotalCents: subtotal,
      totalCents: subtotal + shipping,
      shipDestination,
      escriptStatus: needsEscript ? "pending_signature" : "not_required",
      source: "admin",
      splitMessage: split.message,
      shipToJson: JSON.stringify({ destination: shipDestination, notes }),
      partnerExternalRef: `admin:${admin.id}:${Date.now()}`,
      lines: { create: lineCreates },
    },
    include: { lines: true },
  });

  await prisma.clinicalPatient.update({
    where: { id: patient.id },
    data: { lastOrderId: order.id },
  });

  if (forwardPharmacy && !needsEscript) {
    await openRxcoreOrder({
      orderId: order.id,
      lines: order.lines
        .filter((line) => isProductClass(line.productClass))
        .map((line) => ({
          productClass: line.productClass as "503A",
          patientInitials: line.patientInitials,
        })),
    }).catch((error) => {
      console.error("admin pharmacy forward failed", order.id, error);
    });
  }

  await audit({
    actorId: admin.id,
    action: "order.admin_created",
    object: order.invoiceNumber,
    after: `${order.lines.length} lines; patient:${patient.id}; pay:${paymentStatus}`,
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath(`/admin/patients/${patient.id}`);
  redirect(`/admin/orders/${order.id}?created=1`);
}
