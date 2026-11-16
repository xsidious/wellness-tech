/**
 * Eventide / VitaRelay Practice API readiness for Hub Control.
 * RxHere is a legacy alias only — live path is Eventide software → VitaRelay Practice API.
 */
import { eventideConfigured, getOrderStatus, listPrescribers } from "@/lib/eventide";

export type EventideReadiness = {
  ok: boolean;
  configured: boolean;
  keyKind: "live" | "test" | "missing" | "unknown";
  baseUrl: string;
  hasPlacerUserId: boolean;
  hasPrescriberNpi: boolean;
  hasPrescriberLicense: boolean;
  webhookSecretSet: boolean;
  kianCallbackUrl: string;
  samplePrescriber: string | null;
  blockers: string[];
  nextSteps: string[];
  sampleOrder?: {
    id: string;
    orderNumber?: string;
    status?: string;
    paymentStatus?: string;
    environment?: string;
  } | null;
};

function keyKind(): EventideReadiness["keyKind"] {
  const key =
    process.env.EVENTIDE_API_KEY?.trim() ||
    process.env.VITARELAY_API_KEY?.trim() ||
    process.env.RXHERE_API_TOKEN?.trim() ||
    process.env.RXHERE_API_KEY?.trim() ||
    "";
  if (!key) return "missing";
  if (key.startsWith("vr_live_")) return "live";
  if (key.startsWith("vr_test_")) return "test";
  return "unknown";
}

export async function probeEventideReadiness(sampleOrderId?: string): Promise<EventideReadiness> {
  const configured = eventideConfigured();
  const kind = keyKind();
  const baseUrl = (
    process.env.EVENTIDE_API_BASE_URL ||
    process.env.VITARELAY_PRACTICE_API_BASE_URL ||
    process.env.RXHERE_API_BASE_URL ||
    "https://vitarelay.com/api/public/practice/v1"
  ).replace(/\/$/, "");

  const hasPlacerUserId = Boolean(
    process.env.EVENTIDE_PLACED_BY_USER_ID?.trim() || process.env.VITARELAY_PLACED_BY_USER_ID?.trim(),
  );
  const hasPrescriberNpi = Boolean(process.env.EVENTIDE_PRESCRIBER_NPI?.trim());
  const hasPrescriberLicense = Boolean(process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER?.trim());
  const webhookSecretSet = Boolean(
    process.env.EVENTIDE_WEBHOOK_SECRET?.trim() ||
      process.env.VITARELAY_WEBHOOK_SECRET?.trim() ||
      process.env.RXHERE_WEBHOOK_SECRET?.trim(),
  );
  const kianCallbackUrl = `${(process.env.KIAN_APP_URL || "https://www.kianprive.com").replace(/\/$/, "")}/api/webhooks/wellness-tech-order`;

  const blockers: string[] = [];
  const nextSteps: string[] = [];

  if (!configured) blockers.push("No EVENTIDE_API_KEY / VITARELAY_API_KEY configured.");
  if (kind === "test") {
    blockers.push("Using a vr_test_ key — sandbox only. Live Eventide dashboard will not show these orders.");
  }
  if (!hasPlacerUserId) {
    blockers.push("EVENTIDE_PLACED_BY_USER_ID missing — Practice API may reject placements (placed_by_user_id).");
  }
  if (!hasPrescriberNpi || !hasPrescriberLicense) {
    blockers.push("Default Eventide prescriber NPI / license env vars incomplete.");
  }
  if (!webhookSecretSet) {
    blockers.push("Webhook signing secret missing — Eventide status updates cannot be verified.");
  }

  let samplePrescriber: string | null = null;
  if (configured) {
    try {
      const roster = await listPrescribers();
      if (roster.ok) {
        const rows = Array.isArray((roster.data as { data?: unknown })?.data)
          ? ((roster.data as { data: Array<{ full_name?: string; npi_number?: string }> }).data)
          : [];
        const first = rows[0];
        samplePrescriber = first
          ? `${first.full_name || "Prescriber"} · NPI ${first.npi_number || "—"}`
          : null;
        if (!rows.length) blockers.push("Prescriber roster is empty on Eventide/VitaRelay.");
      }
    } catch {
      blockers.push("Could not read Eventide prescriber roster.");
    }
  }

  let sampleOrder: EventideReadiness["sampleOrder"] = null;
  if (configured && sampleOrderId) {
    try {
      const remote = await getOrderStatus(sampleOrderId);
      if (remote.ok) {
        const d = (remote.data as { data?: Record<string, unknown> })?.data || (remote.data as Record<string, unknown>);
        sampleOrder = {
          id: sampleOrderId,
          orderNumber: String(d.order_number || ""),
          status: String(d.status || ""),
          paymentStatus: String(d.payment_status || ""),
          environment: d.environment ? String(d.environment) : undefined,
        };
        if (String(d.payment_status || d.status || "").toLowerCase() === "awaiting_payment") {
          blockers.push(
            "Latest Eventide order is awaiting_payment — practice card/invoice billing is not clearing on VitaRelay.",
          );
        }
        if (String(d.environment || "").toLowerCase() === "sandbox") {
          blockers.push(
            "VitaRelay marked the order environment=sandbox. Confirm the live Eventide/VitaRelay practice account is billing-activated (not dry-run).",
          );
        }
      }
    } catch {
      // optional
    }
  }

  if (blockers.some((b) => /awaiting_payment|sandbox|billing/i.test(b))) {
    nextSteps.push("Sign in at https://vitarelay.com/login (Eventide software / VitaRelay practice desk).");
    nextSteps.push("Add a practice payment method (card on file) or ask Eventide to enable invoice billing.");
    nextSteps.push("Confirm webhook URL is https://www.wellnesstechdistribution.com/api/webhooks/eventide");
    nextSteps.push("Re-place or retry an order from Wellness Tech after billing is live — then search VR-… in the practice Orders tab.");
  } else if (!blockers.length) {
    nextSteps.push("Eventide Practice API looks ready. Place from WT portal or KIAN paid therapy → WT partner orders.");
  } else {
    nextSteps.push("Fix the blockers above, then retry placement from Wellness Tech Admin → Orders.");
  }

  return {
    ok: blockers.length === 0,
    configured,
    keyKind: kind,
    baseUrl,
    hasPlacerUserId,
    hasPrescriberNpi,
    hasPrescriberLicense,
    webhookSecretSet,
    kianCallbackUrl,
    samplePrescriber,
    blockers,
    nextSteps,
    sampleOrder,
  };
}
