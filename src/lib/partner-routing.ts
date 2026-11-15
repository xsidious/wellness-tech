/**
 * Business routing rules for partner sites (from Alycia / KIAN ops).
 * Keep WT tenancy + intake site keys, but never treat every site as a “clinic.”
 */
import type { PartnerClinicSite } from "@/lib/partner-org";

export type PartnerRoutingKind =
  | "processor" // KIAN Privé — clinical + payment processor
  | "clinic_via_kian" // Partner clinic; intakes go through KIAN first
  | "clinic_own_md_telehealth" // Own doctor on site; out-of-state via telehealth
  | "referral_partner"; // Not a clinic — referral / program partner

export type PartnerRoutingProfile = {
  site: PartnerClinicSite;
  kind: PartnerRoutingKind;
  label: string;
  /** Short ops note shown in Hub / Connected Sites. */
  routingNote: string;
  intakesViaKian: boolean;
  isClinic: boolean;
  hasOwnDoctor: boolean;
  usesTelehealthOtherStates: boolean;
};

export const PARTNER_ROUTING: Record<PartnerClinicSite, PartnerRoutingProfile> = {
  "kian-prive": {
    site: "kian-prive",
    kind: "processor",
    label: "KIAN Privé",
    routingNote:
      "Clinical processor: intakes, telemedicine, bloodwork, therapy, and payment. Forwards paid Rx to Wellness Tech → VitaRelay.",
    intakesViaKian: true,
    isClinic: true,
    hasOwnDoctor: true,
    usesTelehealthOtherStates: true,
  },
  "facial-design": {
    site: "facial-design",
    kind: "clinic_via_kian",
    label: "Facial Design Studio",
    routingNote: "Partner clinic. Patients go through KIAN Privé first (intake → therapy → pay), then Wellness Tech fulfillment.",
    intakesViaKian: true,
    isClinic: true,
    hasOwnDoctor: true,
    usesTelehealthOtherStates: false,
  },
  "threefold-strength": {
    site: "threefold-strength",
    kind: "clinic_via_kian",
    label: "Threefold Strength",
    routingNote: "Partner clinic. Patients go through KIAN Privé first (intake → therapy → pay), then Wellness Tech fulfillment.",
    intakesViaKian: true,
    isClinic: true,
    hasOwnDoctor: true,
    usesTelehealthOtherStates: false,
  },
  "4everglow": {
    site: "4everglow",
    kind: "clinic_own_md_telehealth",
    label: "4everglow",
    routingNote:
      "Partner clinic with their own doctor on site. Out-of-state patients use telehealth. Intakes still land on KIAN; paid Rx → Wellness Tech.",
    intakesViaKian: true,
    isClinic: true,
    hasOwnDoctor: true,
    usesTelehealthOtherStates: true,
  },
  "hope-and-haven": {
    site: "hope-and-haven",
    kind: "referral_partner",
    label: "Hope & Haven International",
    routingNote:
      "Not a clinic. Referral / program partner. Patients are processed by KIAN Privé — do not treat as an independent clinic practice.",
    intakesViaKian: true,
    isClinic: false,
    hasOwnDoctor: false,
    usesTelehealthOtherStates: false,
  },
};

export function partnerRoutingFor(site: PartnerClinicSite | string): PartnerRoutingProfile {
  const key = String(site || "kian-prive") as PartnerClinicSite;
  return PARTNER_ROUTING[key] || PARTNER_ROUTING["kian-prive"];
}
