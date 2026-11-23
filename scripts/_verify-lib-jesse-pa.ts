import { placePrescriptionOrder, resolveEventideIssuePlan } from "../src/lib/eventide";

async function main() {
  const stamp = Date.now();
  const plan = await resolveEventideIssuePlan({ state: "FL" });
  if (!plan.ok || !plan.prescriber) throw new Error(JSON.stringify(plan));

  // Existing VitaRelay patient (PA) — proves library multi-state path end-to-end.
  const result = await placePrescriptionOrder({
    partnerOrderId: `WT-LIB-JESSE-PA-${stamp}`,
    shippingDestinationType: "patient_direct",
    patient: {
      firstName: "Jesse",
      lastName: "Kaufman",
      dateOfBirth: "2013-05-24",
      email: "sevas@mailinator.com",
      phone: "(865) 874-6478",
      address: {
        line1: "Tempore illo provid",
        line2: "Qui magni exercitati",
        city: "Voluptatem iusto mol",
        state: "PA",
        zipCode: "57432",
        country: "US",
      },
    },
    prescriber: plan.prescriber,
    items: [
      {
        sku: "119df359-ebf4-4c6a-8084-64cdadac5853",
        platformProductId: "119df359-ebf4-4c6a-8084-64cdadac5853",
        name: "AHK-Cu 20mg",
        quantity: 1,
        sig: "As directed by Eventide prescribing clinician.",
      },
    ],
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok || !result.orderId || /^EVT-/i.test(result.orderId)) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
