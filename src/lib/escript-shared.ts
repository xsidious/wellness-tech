import { parseJsonSafe } from "@/lib/clinical-chart";

/** Versioned attestation — bump version when legal text changes. */
export const ESCRIPT_ATTESTATION_VERSION = "wt-escript-v1";

export const ESCRIPT_ATTESTATION_TEXT = [
  "I am a licensed prescriber authorized to issue this prescription.",
  "I have reviewed the patient identity, medication, strength, quantity, directions, and days supply.",
  "This electronic signature is my legal signature on this prescription record.",
  "I understand this record and its content hash are retained for pharmacy fulfillment and audit.",
].join(" ");

export type EscriptLineSnapshot = {
  sku: string;
  name: string;
  productClass: string;
  qty: number;
  unitPriceCents: number;
  strength: string;
  size: string;
  dosageForm: string;
  sig: string;
  daysSupply: number;
  patientInitials: string;
};

export type EscriptPatientSnapshot = {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  allergies: string;
  medications: string;
  address: Record<string, unknown>;
};

export type EscriptSigner = {
  id: string;
  name: string;
  email: string;
  roles: string;
  credential?: {
    npi: string;
    displayName: string;
    specialty?: string;
    licenseCipher?: string;
    deaCipher?: string;
    verificationTier: number;
  } | null;
};

export function buildPatientSnapshot(patient: {
  fullName: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  allergies?: string | null;
  medications?: string | null;
  addressJson?: string | null;
} | null): EscriptPatientSnapshot {
  if (!patient) {
    return {
      fullName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      gender: "",
      allergies: "",
      medications: "",
      address: {},
    };
  }
  return {
    fullName: patient.fullName,
    email: patient.email,
    phone: patient.phone || "",
    dateOfBirth: patient.dateOfBirth || "",
    gender: patient.gender || "",
    allergies: patient.allergies || "",
    medications: patient.medications || "",
    address: parseJsonSafe<Record<string, unknown>>(patient.addressJson, {}),
  };
}

export function buildLinesSnapshot(
  lines: Array<{
    sku: string;
    name: string;
    productClass: string;
    qty: number;
    unitPriceCents: number;
    strength?: string | null;
    size?: string | null;
    dosageForm?: string | null;
    sig?: string | null;
    daysSupply?: number | null;
    patientInitials?: string | null;
  }>,
): EscriptLineSnapshot[] {
  return lines.map((line) => ({
    sku: line.sku,
    name: line.name,
    productClass: line.productClass,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    strength: line.strength || "",
    size: line.size || "",
    dosageForm: line.dosageForm || "",
    sig: line.sig || "",
    daysSupply: line.daysSupply || 0,
    patientInitials: line.patientInitials || "",
  }));
}

export function parseLinesSnapshot(raw: string | null | undefined): EscriptLineSnapshot[] {
  return parseJsonSafe<EscriptLineSnapshot[]>(raw, []);
}

export function parsePatientSnapshot(raw: string | null | undefined): EscriptPatientSnapshot {
  return parseJsonSafe<EscriptPatientSnapshot>(raw, buildPatientSnapshot(null));
}

export function formatAddress(address: Record<string, unknown>) {
  const parts = [address.street1, address.street2, address.city, address.state, address.zip]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return parts.join(", ") || "—";
}

/** Local role parse — keep client-safe modules free of guard/session imports. */
export function escriptRolesOf(raw: string) {
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function assertCanSignEscript(user: EscriptSigner): { ok: true } | { ok: false; error: string } {
  const roles = escriptRolesOf(user.roles);
  if (!roles.some((r) => ["prescriber", "owner", "admin"].includes(r))) {
    return { ok: false, error: "Only a credentialed prescriber (or practice owner) may sign an eScript." };
  }
  if (!user.credential?.npi?.trim()) {
    return { ok: false, error: "Add your NPI under Practitioners before signing prescriptions." };
  }
  if ((user.credential.verificationTier ?? 0) < 1) {
    return { ok: false, error: "Prescriber credentials must be verified (tier ≥ 1) before signing." };
  }
  return { ok: true };
}
