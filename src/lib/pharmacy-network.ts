/** Licensed fulfillment partners shown in the practice portal (no PHI). */
export type PharmacyPartner = {
  id: string;
  name: string;
  type: "503A" | "503B" | "Hybrid";
  region: string;
  specialties: string[];
  capabilities: string[];
  erp: string[];
  sla: string;
  status: "online" | "maintenance";
  description: string;
};

export const PHARMACY_NETWORK: PharmacyPartner[] = [
  {
    id: "eventide-rxhere",
    name: "Eventide / RxHere Network",
    type: "Hybrid",
    region: "National routing",
    specialties: ["GLP-1", "Peptides", "Hormone", "Dermatology compounds"],
    capabilities: [
      "Patient-specific 503A compounds",
      "Office-use 503B where permitted",
      "Direct-to-patient & practice ship",
      "Cold-chain + ambient SKUs",
      "Order status webhooks",
    ],
    erp: ["RxHere Partner API", "Eventide fulfillment"],
    sla: "Most compounds ship within 1–3 business days after clinical clearance",
    status: "online",
    description:
      "Primary Wellness Tech fulfillment lane. Orders from the practice portal and KIAN therapeutics route here for licensed dispensing.",
  },
  {
    id: "office-stock",
    name: "Office-use stock lane",
    type: "503B",
    region: "Practice ship only",
    specialties: ["Exosomes", "Clinical supplies", "Topicals"],
    capabilities: [
      "Non-patient office inventory",
      "Bulk / clinic-use SKUs",
      "No patient initials required",
    ],
    erp: ["Wellness Tech catalog"],
    sla: "Ships with practice supply orders",
    status: "online",
    description:
      "For clinic-administered or office-use products that do not require a named patient on the line.",
  },
];

export const FULFILLMENT_FLOW = [
  {
    step: "01",
    title: "Clinical intake",
    body: "Patient details, consents, and signatures arrive from KIAN or are captured in-portal.",
  },
  {
    step: "02",
    title: "Prescriber authorization",
    body: "Credentialed NPI signs the compound. Sig, days supply, and ship-to are locked.",
  },
  {
    step: "03",
    title: "Pharmacy routing",
    body: "Lines route to 503A/503B partners. Cold-chain and controlled SKUs follow partner rules.",
  },
  {
    step: "04",
    title: "Fulfillment & tracking",
    body: "Status webhooks update the order. Practice and patient can follow shipment progress.",
  },
];
