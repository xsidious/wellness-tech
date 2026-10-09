import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { equipmentCatalog, equipmentHoldReason } from "../src/lib/equipment-catalog";
import { exosomeCatalog, exosomeHoldReason, exosomeUse } from "../src/lib/exosome-catalog";

const prisma = new PrismaClient();
const pin = bcrypt.hashSync("246810", 8);
const adminPassword = bcrypt.hashSync("WellnessTech#Admin9!", 12);

async function main() {
  await prisma.orderEvent.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.commission.deleteMany();
  await prisma.orderLine.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.refill.deleteMany();
  await prisma.message.deleteMany();
  await prisma.patientRef.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.prescriberCredential.deleteMany();
  await prisma.affiliateProfile.deleteMany();
  await prisma.magicCode.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const fairfax = await prisma.organization.create({
    data: {
      type: "practice",
      legalName: "Fairfax Concierge",
      slug: "fairfax",
      verificationTier: 2,
      assignedRep: "Alex Morgan",
    },
  });
  const affiliateOrg = await prisma.organization.create({
    data: { type: "affiliate", legalName: "North Affiliates", slug: "north-affiliates", verificationTier: 0 },
  });
  const adminOrg = await prisma.organization.create({
    data: { type: "operator", legalName: "Wellness Tech", slug: "wellness-tech", verificationTier: 0 },
  });

  const owner = await prisma.user.create({
    data: {
      orgId: fairfax.id,
      email: "owner@fairfax.demo",
      name: "Dana Ellis",
      roles: JSON.stringify(["owner", "prescriber"]),
      mfaHash: pin,
      mfaEnabled: true,
    },
  });
  await prisma.user.create({
    data: {
      orgId: fairfax.id,
      email: "billing@fairfax.demo",
      name: "Jordan Lee",
      roles: JSON.stringify(["billing"]),
      mfaHash: pin,
      mfaEnabled: true,
    },
  });
  const affiliate = await prisma.user.create({
    data: {
      orgId: affiliateOrg.id,
      email: "affiliate@sales.demo",
      name: "Riley Chen",
      roles: JSON.stringify(["affiliate"]),
      mfaHash: pin,
      mfaEnabled: true,
    },
  });
  await prisma.affiliateProfile.create({
    data: { userId: affiliate.id, code: "FAIRFAX", payoutToken: "tok_bank_sandbox", w9Status: "sandbox_received" },
  });
  await prisma.organization.update({ where: { id: fairfax.id }, data: { referringAffiliateId: affiliate.id } });
  await prisma.user.create({
    data: {
      orgId: adminOrg.id,
      email: "admin@wellnesstech.demo",
      name: "Wellness Tech Admin",
      roles: JSON.stringify(["admin"]),
      passwordHash: adminPassword,
      mfaHash: pin,
      mfaEnabled: true,
    },
  });
  await prisma.prescriberCredential.create({
    data: {
      userId: owner.id,
      npi: "1000000001",
      displayName: "Dana Ellis, MD",
      specialty: "Concierge medicine",
      licenseCipher: "",
      oigStatus: "pending_vendor",
      verificationTier: 2,
    },
  });
  await prisma.apiKey.create({
    data: {
      orgId: fairfax.id,
      label: "Sandbox demo",
      keyHash: createHash("sha256").update("wt_sandbox_demo_key").digest("hex"),
      prefix: "wt_sandbox_dem",
      sandbox: true,
    },
  });

  await prisma.product.createMany({
    data: [
      {
        sku: "GLP1-503A",
        rxcoreFormularyId: "rxc-glp1",
        name: "Compounded GLP-1 (sample)",
        productClass: "503A",
        category: "Weight",
        form: "Injectable",
        strength: "Sample",
        storage: "cold",
        budDays: 90,
        rxRequired: true,
        priceCents: 18900,
        description: "Patient-specific sample line for the mixed-cart test. Not a dosing protocol.",
      },
      {
        sku: "B12-503B",
        rxcoreFormularyId: "rxc-b12",
        name: "Office B12 multi-dose (sample)",
        productClass: "503B",
        category: "Office stock",
        form: "Injectable",
        storage: "cold",
        officeUse: true,
        priceCents: 6400,
        description: "Office-use sample. Tier 2 required.",
      },
      {
        sku: "SUP-SYRINGE-10",
        rxcoreFormularyId: "rxc-syringe",
        name: "Syringe kit",
        productClass: "supply",
        category: "Supplies",
        storage: "ambient",
        priceCents: 1200,
        description: "Practice supply. Eligible for affiliate commission.",
      },
      {
        sku: "DEV-CASE",
        rxcoreFormularyId: "rxc-case",
        name: "Cold-chain shipper",
        productClass: "device",
        category: "Equipment",
        storage: "ambient",
        priceCents: 8400,
        description: "Device sample. Eligible for affiliate commission.",
      },
      ...exosomeCatalog.map((line) => ({
        sku: line.sku,
        rxcoreFormularyId: `form-${line.sku.toLowerCase()}`,
        name: line.name,
        productClass: "exosome",
        category: line.category,
        form: exosomeUse(line.category),
        size: line.size,
        storage: "ambient",
        priceCents: line.priceCents,
        orderable: false,
        holdReason: exosomeHoldReason,
        description: `${exosomeUse(line.category)}. ${line.category}. ${line.size}. Unit price is from the order form. Supplier payout is not set yet.`,
      })),
      ...equipmentCatalog.map((line) => ({
        sku: line.sku,
        rxcoreFormularyId: `form-${line.sku.toLowerCase()}`,
        name: line.name,
        productClass: "device",
        category: line.category,
        form: line.form,
        size: line.size,
        storage: "ambient",
        priceCents: 0,
        orderable: false,
        holdReason: equipmentHoldReason,
        description: line.description,
      })),
      {
        sku: "BULK-API",
        rxcoreFormularyId: "rxc-bulk",
        name: "Bulk API sample",
        productClass: "bulk_api",
        category: "Bulk API",
        storage: "ambient",
        priceCents: 0,
        orderable: false,
        holdReason: "Buyer eligibility is waiting on compliance sign-off.",
        description: "Not orderable.",
      },
    ],
  });

  await prisma.contentItem.createMany({
    data: [
      {
        slug: "peptide-catalog",
        type: "catalog",
        title: "Precision Peptide Therapy — marketing catalog",
        accessTier: 1,
        body: "Gated sample catalog. Protocols here are titles only. Prescribers review every cart before anything is ordered.",
      },
      {
        slug: "wellness-protocols",
        type: "protocol",
        title: "Compounded Wellness Protocols — sales sheet",
        accessTier: 1,
        body: "Sales sheet placeholder for the education library.",
      },
      {
        slug: "contraindications",
        type: "reference",
        title: "503A and 503B contraindication reference",
        accessTier: 1,
        body: "Reference placeholder. This app does not give dosing advice.",
      },
      {
        slug: "weight-protocol",
        type: "protocol",
        title: "Weight management protocol",
        accessTier: 1,
        protocolSku: "GLP1-503A",
        body: "Adds the sample GLP-1 line to the cart for prescriber review. It does not choose a dose.",
      },
    ],
  });

  await prisma.refill.createMany({
    data: [
      {
        orgId: fairfax.id,
        patientInitials: "A.B.",
        productName: "Compounded GLP-1 (sample)",
        productSku: "GLP1-503A",
        dueAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        daysSupply: 30,
      },
      {
        orgId: fairfax.id,
        patientInitials: "C.D.",
        productName: "Compounded GLP-1 (sample)",
        productSku: "GLP1-503A",
        dueAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
        daysSupply: 30,
      },
    ],
  });

  await prisma.patientRef.create({
    data: { orgId: fairfax.id, initials: "A.B.", rxcorePatientId: "pat_seed_ab" },
  });
  console.log("Seeded sandbox accounts.");
  console.log("Admin password login: admin@wellnesstech.demo / WellnessTech#Admin9! → /admin/login");
  console.log("Practice PIN login: owner@fairfax.demo PIN 246810 → /login");
  console.log("API key wt_sandbox_demo_key");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
