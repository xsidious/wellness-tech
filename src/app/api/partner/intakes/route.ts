import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePartnerOrgForSite, normalizePartnerSite, partnerSecretOk } from "@/lib/partner-org";
import { touchConnectedSiteOrder } from "@/lib/connected-sites";

type IntakeBody = {
  partnerSite?: string;
  kianIntakeId?: string;
  email?: string;
  patient?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    phone?: string;
    email?: string;
    gender?: string;
    allergies?: string;
  };
  intake?: {
    id?: string;
    status?: string;
    source?: string;
    reference?: string;
    statusNote?: string;
    assignedProvider?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  therapy?: Record<string, unknown> | null;
  programs?: unknown[];
  processing?: Record<string, unknown> | null;
  clinicalChart?: Record<string, unknown> | null;
};

/**
 * Mirror KIAN (and partner) intakes into WT ClinicalPatient so the hub can oversee
 * processing before payment. Does not place pharmacy orders.
 */
export async function POST(request: Request) {
  if (!partnerSecretOk(request.headers.get("x-wt-partner-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as IntakeBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });

  const partnerSite = normalizePartnerSite(body.partnerSite || request.headers.get("x-wt-partner-site"));
  const kianIntakeId = String(body.kianIntakeId || body.intake?.id || "").trim();
  const email = String(body.email || body.patient?.email || "")
    .trim()
    .toLowerCase();
  if (!kianIntakeId) return NextResponse.json({ ok: false, error: "kianIntakeId is required." }, { status: 400 });
  if (!email.includes("@")) return NextResponse.json({ ok: false, error: "Valid email required." }, { status: 400 });

  const { org } = await ensurePartnerOrgForSite(partnerSite);
  const firstName = String(body.patient?.firstName || "").trim() || "Patient";
  const lastName = String(body.patient?.lastName || "").trim() || "Unknown";
  const fullName = `${firstName} ${lastName}`.trim();

  const clinicalChart = {
    ...(body.clinicalChart || {}),
    intake: body.intake || {},
    therapy: body.therapy || null,
    processing: body.processing || { processor: "kian-prive", hub: "wellness-tech" },
    syncedAt: new Date().toISOString(),
  };

  const patient = await prisma.clinicalPatient.upsert({
    where: {
      orgId_email_kianIntakeId: {
        orgId: org.id,
        email,
        kianIntakeId,
      },
    },
    create: {
      orgId: org.id,
      email,
      fullName,
      phone: String(body.patient?.phone || "").trim(),
      dateOfBirth: String(body.patient?.dateOfBirth || "").trim(),
      gender: String(body.patient?.gender || "").trim(),
      allergies: String(body.patient?.allergies || "").trim() || "NKDA",
      kianIntakeId,
      kianReference: String(body.intake?.reference || kianIntakeId).trim(),
      sourceSite: partnerSite,
      intakeStatus: String(body.intake?.status || "").trim(),
      statusNote: String(body.intake?.statusNote || body.intake?.assignedProvider || "").trim(),
      programsJson: JSON.stringify(body.programs || []),
      therapyJson: JSON.stringify(body.therapy || {}),
      clinicalChartJson: JSON.stringify(clinicalChart),
      intakePayloadJson: JSON.stringify({
        intake: body.intake,
        processing: body.processing,
      }),
    },
    update: {
      fullName,
      phone: String(body.patient?.phone || "").trim(),
      dateOfBirth: String(body.patient?.dateOfBirth || "").trim(),
      gender: String(body.patient?.gender || "").trim(),
      allergies: String(body.patient?.allergies || "").trim() || undefined,
      kianReference: String(body.intake?.reference || kianIntakeId).trim(),
      sourceSite: partnerSite,
      intakeStatus: String(body.intake?.status || "").trim(),
      statusNote: String(body.intake?.statusNote || body.intake?.assignedProvider || "").trim(),
      programsJson: JSON.stringify(body.programs || []),
      therapyJson: JSON.stringify(body.therapy || {}),
      clinicalChartJson: JSON.stringify(clinicalChart),
      intakePayloadJson: JSON.stringify({
        intake: body.intake,
        processing: body.processing,
      }),
    },
  });

  try {
    await touchConnectedSiteOrder(partnerSite);
  } catch {
    // best-effort
  }

  return NextResponse.json({
    ok: true,
    patientId: patient.id,
    orgId: org.id,
    partnerSite,
    intakeStatus: patient.intakeStatus,
  });
}

/** Hub pull of mirrored intakes for a clinic site. */
export async function GET(request: Request) {
  if (!partnerSecretOk(request.headers.get("x-wt-partner-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(request.url);
  const site = normalizePartnerSite(url.searchParams.get("site") || request.headers.get("x-wt-partner-site"));
  const { org } = await ensurePartnerOrgForSite(site);
  const rows = await prisma.clinicalPatient.findMany({
    where: { orgId: org.id, kianIntakeId: { not: "" } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      fullName: true,
      kianIntakeId: true,
      intakeStatus: true,
      statusNote: true,
      sourceSite: true,
      therapyJson: true,
      updatedAt: true,
      createdAt: true,
      lastOrderId: true,
    },
  });
  return NextResponse.json({ ok: true, partnerSite: site, count: rows.length, intakes: rows });
}
