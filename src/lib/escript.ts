import { createHash } from "crypto";
import { decryptField } from "@/lib/crypto";
import {
  ESCRIPT_ATTESTATION_TEXT,
  ESCRIPT_ATTESTATION_VERSION,
  assertCanSignEscript,
  type EscriptLineSnapshot,
  type EscriptPatientSnapshot,
  type EscriptSigner,
} from "@/lib/escript-shared";

export * from "@/lib/escript-shared";

export function safeDecryptCredential(cipher: string | undefined | null) {
  if (!cipher) return "";
  try {
    return decryptField(cipher);
  } catch {
    return "";
  }
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
