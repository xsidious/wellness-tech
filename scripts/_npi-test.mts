import { lookupNpiInCms, matchLicenseToCms } from "../src/lib/npi-registry";

const found = await lookupNpiInCms("1679576722");
console.log(JSON.stringify(found, null, 2));
if (found.ok) {
  console.log("match good", matchLicenseToCms(found.provider, "NE", "12637"));
  console.log("match bad", matchLicenseToCms(found.provider, "NE", "99999"));
  console.log("match other state", matchLicenseToCms(found.provider, "CA", "A12345"));
}
