import { createHash } from "crypto";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { decryptField } from "@/lib/crypto";
import { rolesOf } from "@/lib/guard";

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

export function assertCanSignEscript(user: EscriptSigner): { ok: true } | { ok: false; error: string } {
  const roles = rolesOf(user.roles);
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

export function safeDecryptCredential(cipher: string | undefined | null) {
  if (!cipher) return "";
  try {
    return decryptField(cipher);
  } catch {
    return "";
  }
}

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

export function hashEscriptContent(input: {
  orderId: string;
  invoiceNumber?: string;
  signerUserId: string;
  signerEmail: string;
  npi: string;
  displayName: string;
  licenseState: string;
  licenseNumber: string;
  deaNumber: string;
  directions: string;
  attestationVersion: string;
  attestationText: string;
  patient: EscriptPatientSnapshot;
  lines: EscriptLineSnapshot[];
  signedAtIso: string;
}) {
  const canonical = JSON.stringify({
    v: input.attestationVersion,
    orderId: input.orderId,
    invoiceNumber: input.invoiceNumber || "",
    signerUserId: input.signerUserId,
    signerEmail: input.signerEmail,
    npi: input.npi,
    displayName: input.displayName,
    licenseState: input.licenseState,
    licenseNumber: input.licenseNumber,
    deaNumber: input.deaNumber,
    directions: input.directions,
    attestationText: input.attestationText,
    patient: input.patient,
    lines: input.lines,
    signedAt: input.signedAtIso,
  });
  return createHash("sha256").update(canonical).digest("hex");
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

export type SignedEscriptPayload = {
  status: "signed";
  signatureDataUrl: string;
  signedById: string;
  signedAt: Date;
  npi: string;
  displayName: string;
  signerEmail: string;
  licenseState: string;
  licenseNumber: string;
  deaNumber: string;
  directions: string;
  attestationText: string;
  attestationVersion: string;
  signedIp: string;
  signedUserAgent: string;
  patientSnapshotJson: string;
  linesSnapshotJson: string;
  contentHash: string;
  clinicalPatientId?: string | null;
};

export function buildSignedEscriptPayload(args: {
  user: EscriptSigner;
  orderId: string;
  invoiceNumber?: string;
  clinicalPatientId?: string | null;
  patient: EscriptPatientSnapshot;
  lines: EscriptLineSnapshot[];
  signatureDataUrl: string;
  directions: string;
  attestationAccepted: boolean;
  ip?: string;
  ua?: string;
  licenseState?: string;
}): { ok: true; data: SignedEscriptPayload } | { ok: false; error: string } {
  const gate = assertCanSignEscript(args.user);
  if (!gate.ok) return gate;
  if (!args.signatureDataUrl.startsWith("data:image")) {
    return { ok: false, error: "A handwritten electronic signature is required." };
  }
  if (!args.attestationAccepted) {
    return { ok: false, error: "Confirm the prescribing attestation before signing." };
  }
  if (!args.lines.length) {
    return { ok: false, error: "No prescription lines to sign." };
  }

  const npi = args.user.credential!.npi.trim();
  const displayName = args.user.credential?.displayName || args.user.name;
  const licenseNumber = safeDecryptCredential(args.user.credential?.licenseCipher);
  const deaNumber = safeDecryptCredential(args.user.credential?.deaCipher);
  const licenseState = (args.licenseState || "").trim().toUpperCase().slice(0, 2);
  const directions = args.directions.trim() || "As directed by prescribing clinician.";
  const signedAt = new Date();
  const contentHash = hashEscriptContent({
    orderId: args.orderId,
    invoiceNumber: args.invoiceNumber,
    signerUserId: args.user.id,
    signerEmail: args.user.email,
    npi,
    displayName,
    licenseState,
    licenseNumber,
    deaNumber,
    directions,
    attestationVersion: ESCRIPT_ATTESTATION_VERSION,
    attestationText: ESCRIPT_ATTESTATION_TEXT,
    patient: args.patient,
    lines: args.lines,
    signedAtIso: signedAt.toISOString(),
  });

  return {
    ok: true,
    data: {
      status: "signed",
      signatureDataUrl: args.signatureDataUrl,
      signedById: args.user.id,
      signedAt,
      npi,
      displayName,
      signerEmail: args.user.email,
      licenseState,
      licenseNumber,
      deaNumber,
      directions,
      attestationText: ESCRIPT_ATTESTATION_TEXT,
      attestationVersion: ESCRIPT_ATTESTATION_VERSION,
      signedIp: (args.ip || "").slice(0, 120),
      signedUserAgent: (args.ua || "").slice(0, 300),
      patientSnapshotJson: JSON.stringify(args.patient),
      linesSnapshotJson: JSON.stringify(args.lines),
      contentHash,
      clinicalPatientId: args.clinicalPatientId,
    },
  };
}
