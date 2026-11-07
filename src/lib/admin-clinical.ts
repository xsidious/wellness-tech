import { parseJsonSafe } from "@/lib/clinical-chart";

export type PrescriberSnapshot = {
  name: string;
  npi: string;
  email: string;
  source: "escript" | "order_json" | "line" | "placed_by" | "none";
};

export function parsePrescriberJson(raw: string | null | undefined): PrescriberSnapshot {
  const j = parseJsonSafe<Record<string, unknown>>(raw, {});
  const name = String(j.displayName || j.name || j.fullName || j.prescriberName || "").trim();
  const npi = String(j.npi || j.npiNumber || "").trim();
  const email = String(j.email || "").trim().toLowerCase();
  if (!name && !npi && !email) {
    return { name: "", npi: "", email: "", source: "none" };
  }
  return { name, npi, email, source: "order_json" };
}

type OrderLike = {
  prescriberJson?: string | null;
  placedBy?: { id?: string; name?: string | null; email?: string | null; roles?: string | null } | null;
  lines?: Array<{ prescriber?: string | null }> | null;
  escripts?: Array<{
    displayName?: string | null;
    npi?: string | null;
    signedBy?: { name?: string | null; email?: string | null } | null;
  }> | null;
};

function rolesIncludePrescriber(roles: string | null | undefined) {
  if (!roles) return false;
  try {
    const parsed = JSON.parse(roles) as string[];
    return parsed.some((r) => ["prescriber", "owner", "admin"].includes(r));
  } catch {
    return /prescriber|owner|admin/i.test(roles);
  }
}

/** Resolve the clinician attributed to an order (eScript signer → JSON → line → placer). */
export function resolveOrderPrescriber(order: OrderLike): PrescriberSnapshot {
  const escript = order.escripts?.[0];
  if (escript?.displayName || escript?.npi || escript?.signedBy?.name) {
    return {
      name: String(escript.displayName || escript.signedBy?.name || "").trim(),
      npi: String(escript.npi || "").trim(),
      email: String(escript.signedBy?.email || "").trim().toLowerCase(),
      source: "escript",
    };
  }

  const fromJson = parsePrescriberJson(order.prescriberJson);
  if (fromJson.source !== "none") return fromJson;

  const lineName = order.lines?.map((l) => (l.prescriber || "").trim()).find(Boolean);
  if (lineName) {
    return { name: lineName, npi: "", email: "", source: "line" };
  }

  if (order.placedBy && rolesIncludePrescriber(order.placedBy.roles)) {
    return {
      name: String(order.placedBy.name || "").trim(),
      npi: "",
      email: String(order.placedBy.email || "").trim().toLowerCase(),
      source: "placed_by",
    };
  }

  if (order.placedBy?.name) {
    return {
      name: String(order.placedBy.name).trim(),
      npi: "",
      email: String(order.placedBy.email || "").trim().toLowerCase(),
      source: "placed_by",
    };
  }

  return { name: "", npi: "", email: "", source: "none" };
}

export function formatPrescriberLabel(p: PrescriberSnapshot) {
  if (!p.name && !p.npi) return "—";
  if (p.name && p.npi) return `${p.name} · NPI ${p.npi}`;
  return p.name || `NPI ${p.npi}`;
}
