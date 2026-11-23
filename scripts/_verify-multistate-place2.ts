import { randomInt } from "crypto";
import { placePrescriptionOrder, resolveEventideIssuePlan } from "../src/lib/eventide";

async function main() {
  const stamp = Date.now();
  const plan = await resolveEventideIssuePlan({ state: "FL" });
  if (!plan.ok || plan.mode !== "own" || !plan.prescriber) throw new Error(JSON.stringify(plan));
  const phone = `+1305${randomInt(2000000, 8999999)}`;
  const result = await placePrescriptionOrder({
    partnerOrderId: `WT-LIB-PA2-${stamp}`,
    shippingDestinationType: "patient_direct",
    patient: {
      firstName: "Portal",
      lastName: "Smoke",
      dateOfBirth: "1988-04-12",
      email: `portal.libpa+${stamp}@wellnesstechdistribution.com`,
      phone,
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
        sig: "As directed",
      },
    ],
  });
  console.log(JSON.stringify({ phone, result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
