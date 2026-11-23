const fs = require("fs");
const raw = fs.readFileSync(
  "C:/Users/FindMeAnywhere/.cursor/projects/c-Users-FindMeAnywhere-Desktop-kianprive/agent-tools/d7b9884a-0b24-4b16-ada0-281cc9a57eb2.txt",
  "utf8",
);
const j = JSON.parse(raw);
let text = j.rawHtml || "";
text = text
  .replace(/<[^>]+>/g, "\n")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");

const p = text.indexOf("summary: Post a prescription");
console.log(text.slice(p, p + 2200));
console.log("\n---- schemas ----\n");
for (const name of [
  "PatientInput:",
  "PrescriberInput:",
  "PrescriptionLineInput:",
  "ShippingAddressInput:",
  "CreatePrescriptionRequest:",
  "PlaceOrderRequest:",
]) {
  const i = text.indexOf(name);
  console.log("\n====", name, i, "====");
  if (i >= 0) console.log(text.slice(i, i + 1600));
}
