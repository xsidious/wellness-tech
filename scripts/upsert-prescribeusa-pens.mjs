/**
 * Upsert PrescribeUSA pre-filled pens into the Wellness Tech catalog.
 * Usage: node scripts/upsert-prescribeusa-pens.mjs
 */
import { PrismaClient } from "@prisma/client";

const pens = [
  ["PUSA-GLUT-600", "Glutathione 600mg 3mL Pen", "PrescribeUSA Pens", "3 mL pen", "200 mg/mL · 600 mg total", "Pre-filled injectable glutathione pen."],
  ["PUSA-GLP1S-1-5", "GLP-1S Pen 1.5mg", "PrescribeUSA Pens · GLP-1", "0.6 mL pen", "2.5 mg/mL · 1.5 mg total", "Pre-filled GLP-1S injectable pen."],
  ["PUSA-GLP1S-3-5", "GLP-1S Pen 3.5mg", "PrescribeUSA Pens · GLP-1", "0.7 mL pen", "5 mg/mL · 3.5 mg total", "Pre-filled GLP-1S injectable pen."],
  ["PUSA-GLP1S-5-5", "GLP-1S Pen 5.5mg", "PrescribeUSA Pens · GLP-1", "1.1 mL pen", "5 mg/mL · 5.5 mg total", "Pre-filled GLP-1S injectable pen."],
  ["PUSA-GLP1S-7-5", "GLP-1S Pen 7.5mg", "PrescribeUSA Pens · GLP-1", "1.5 mL pen", "5 mg/mL · 7.5 mg total", "Pre-filled GLP-1S injectable pen."],
  ["PUSA-GLP1S-10", "GLP-1S Pen 10mg", "PrescribeUSA Pens · GLP-1", "2 mL pen", "5 mg/mL · 10 mg total", "Pre-filled GLP-1S injectable pen."],
  ["PUSA-GLP2T-40", "GLP-2T Tirzepatide Pen 40mg", "PrescribeUSA Pens · GLP-1", "2 mL pen", "20 mg/mL · 40 mg total", "Pre-filled tirzepatide (GLP-2T) injectable pen."],
  ["PUSA-TESA-IPA-12-3", "Tesamorelin/Ipamorelin 12mg/3mg 3mL Pen", "PrescribeUSA Pens", "3 mL pen", "12 mg / 3 mg total", "Pre-filled Tesamorelin/Ipamorelin combination pen."],
  ["PUSA-B3-1000", "B3 1000mg 3mL Pen", "PrescribeUSA Pens", "3 mL pen", "333.33 mg/mL · 1000 mg total", "Pre-filled B3 injectable pen."],
  ["PUSA-CJC-IPA-5-5", "CJC (no DAC)/Ipamorelin 5/5mg 3mL Pen", "PrescribeUSA Pens", "3 mL pen", "5 mg / 5 mg total", "Pre-filled CJC (no DAC)/Ipamorelin combination pen."],
  ["PUSA-CAGRI-20", "Cagrilinitide 20mg 3mL Pen", "PrescribeUSA Pens · GLP-1", "3 mL pen", "20 mg total", "Pre-filled cagrilintide injectable pen."],
  ["PUSA-KISS-5", "Kisspeptin 5mg 3mL Pen", "PrescribeUSA Pens", "3 mL pen", "5 mg total", "Pre-filled Kisspeptin injectable pen."],
  ["PUSA-IPA-30", "Ipamorelin 30mg 3mL Pen", "PrescribeUSA Pens", "3 mL pen", "30 mg total", "Pre-filled Ipamorelin injectable pen."],
  ["PUSA-5A1MQ-50", "5 Amino 1mq 50mg 3mL Pen", "PrescribeUSA Pens", "3 mL pen", "50 mg total", "Pre-filled 5-Amino-1MQ injectable pen."],
];

const priceCents = 19900;
const prisma = new PrismaClient();

async function main() {
  let upserted = 0;
  for (const [sku, name, category, size, strength, description] of pens) {
    await prisma.product.upsert({
      where: { sku },
      create: {
        sku,
        rxcoreFormularyId: `pusa-${sku.toLowerCase()}`,
        name,
        productClass: "503A",
        category,
        form: "Pre-Filled Injectable Pen",
        strength,
        size,
        storage: "refrigerated",
        rxRequired: true,
        officeUse: false,
        priceCents,
        active: true,
        orderable: true,
        holdReason: "",
        description: `${description} Source: PrescribeUSA. Practice wholesale $199.00.`,
      },
      update: {
        name,
        productClass: "503A",
        category,
        form: "Pre-Filled Injectable Pen",
        strength,
        size,
        storage: "refrigerated",
        rxRequired: true,
        priceCents,
        active: true,
        orderable: true,
        holdReason: "",
        description: `${description} Source: PrescribeUSA. Practice wholesale $199.00.`,
      },
    });
    upserted += 1;
  }
  console.log(`Upserted ${upserted} PrescribeUSA pens into Wellness Tech.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
