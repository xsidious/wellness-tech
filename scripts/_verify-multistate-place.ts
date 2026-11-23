/**
 * End-to-end: placePrescriptionOrder for PA RND via the real lib (multi-state licenses).
 */
import { placePrescriptionOrder, resolveEventideIssuePlan } from "../src/lib/eventide";

async function main() {
  const stamp = Date.now();
  const plan = await resolveEventideIssuePlan({ state: "FL" });
  if (!plan.ok || plan.mode !== "own" || !plan.prescriber) {
    throw new Error(`No FL own MD: ${JSON.stringify(plan)}`);
  }

  const result = await placePrescriptionOrder({
    partnerOrderId: `WT-LIB-PA-${stamp}`,
    shippingMethod: "2_DAY",
    shippingDestinationType: "patient_direct",
    patient: {
      firstName: "Library",
      lastName: "Pennsylvania",
      dateOfBirth: "1988-04-12",
      email: `library.pa+${stamp}@wellnesstechdistribution.com`,
      phone: `+1305577${String(stamp).slice(-4)}`,
      allergies: "NKDA",
      address: {
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        zipCode: "19107",
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
        dosageForm: "Lyophilized Powder",
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
