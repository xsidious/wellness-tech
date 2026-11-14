/** CMS NPPES NPI Registry (API 2.1) helpers. */

export type NpiTaxonomy = {
  code?: string;
  desc?: string;
  state?: string;
  license?: string;
  primary?: boolean;
};

export type NpiLookupResult = {
  npi: string;
  enumerationType: string;
  status: string;
  displayName: string;
  specialty: string;
  taxonomies: NpiTaxonomy[];
};

function normalizeLicense(value: string) {
  return value.replace(/[\s\-./]/g, "").toUpperCase();
}

/** NPI check digit (Luhn variant used by CMS). */
export function isValidNpiChecksum(npi: string) {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = `80840${npi}`.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[digits.length - 1 - i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export async function lookupNpiInCms(npi: string): Promise<
  { ok: true; provider: NpiLookupResult } | { ok: false; error: string }
> {
  const cleaned = npi.replace(/\D/g, "");
  if (!/^\d{10}$/.test(cleaned)) {
    return { ok: false, error: "Enter a valid 10-digit NPI (numbers only)." };
  }
  if (!isValidNpiChecksum(cleaned)) {
    return {
      ok: false,
      error: "That NPI fails the CMS check digit. Double-check the number (typos are common).",
    };
  }

  // Sandbox demo NPI only when explicitly enabled.
  if (cleaned === "1000000001" && (process.env.SANDBOX_AUTH || "").trim().toLowerCase() === "true") {
    return {
      ok: true,
      provider: {
        npi: cleaned,
        enumerationType: "NPI-1",
        status: "A",
        displayName: "Sandbox Prescriber, MD",
        specialty: "Sandbox registry",
        taxonomies: [{ desc: "Sandbox registry", state: "VA", license: "SANDBOX1", primary: true }],
      },
    };
  }

  try {
    const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${cleaned}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: "NPI registry is temporarily unavailable. Try again in a moment." };
    }
    const data = (await response.json()) as {
      result_count?: number;
      results?: {
        number?: string;
        enumeration_type?: string;
        basic?: {
          first_name?: string;
          last_name?: string;
          middle_name?: string;
          organization_name?: string;
          credential?: string;
          status?: string;
          deactivation_date?: string;
        };
        taxonomies?: NpiTaxonomy[];
      }[];
    };

    if (!data.result_count || !data.results?.[0]) {
      return {
        ok: false,
        error:
          "That NPI was not found in the CMS NPPES registry. Use the individual (Type 1) NPI on the NPPES card — not a clinic/org Type 2 NPI, and not a state license number.",
      };
    }

    const row = data.results[0];
    const basic = row.basic || {};
    if (basic.deactivation_date || (basic.status && basic.status !== "A")) {
      return { ok: false, error: "That NPI exists but is not active in the CMS registry." };
    }

    const displayName =
      row.enumeration_type === "NPI-2"
        ? basic.organization_name || "Organization"
        : [basic.first_name, basic.middle_name, basic.last_name, basic.credential].filter(Boolean).join(" ");

    const taxonomies = row.taxonomies || [];
    const primary = taxonomies.find((t) => t.primary) || taxonomies[0];

    return {
      ok: true,
      provider: {
        npi: String(row.number || cleaned),
        enumerationType: row.enumeration_type || "",
        status: basic.status || "A",
        displayName,
        specialty: primary?.desc || "",
        taxonomies,
      },
    };
  } catch {
    return { ok: false, error: "Could not reach the NPI registry. Check your connection and try again." };
  }
}

/**
 * Cross-check state license against CMS taxonomy license fields.
 * CMS license data is provider-reported and sometimes blank — we only hard-fail
 * when CMS lists a license for that state that does not match.
 */
export function matchLicenseToCms(
  provider: NpiLookupResult,
  licenseState: string,
  license: string,
): { ok: true; matched: boolean; note?: string } | { ok: false; error: string } {
  const state = licenseState.trim().toUpperCase();
  const want = normalizeLicense(license);
  if (!/^[A-Z]{2}$/.test(state)) {
    return { ok: false, error: "Select the state on your license." };
  }
  if (want.length < 3) {
    return { ok: false, error: "Enter your state license number." };
  }

  if (provider.enumerationType === "NPI-2") {
    return {
      ok: false,
      error:
        "That NPI is an organization (Type 2). Enter the prescribing clinician’s individual Type 1 NPI instead.",
    };
  }

  const forState = provider.taxonomies.filter((t) => (t.state || "").toUpperCase() === state);
  const withLicense = forState.filter((t) => normalizeLicense(t.license || "").length > 0);

  if (withLicense.length) {
    const hit = withLicense.find((t) => normalizeLicense(t.license || "") === want);
    if (!hit) {
      const listed = withLicense.map((t) => t.license).filter(Boolean).join(", ");
      return {
        ok: false,
        error: `CMS lists license(s) for ${state} on this NPI as ${listed}. Your entry doesn’t match — check the number/state, or update NPPES if the registry is outdated.`,
      };
    }
    return { ok: true, matched: true };
  }

  // No CMS license on file for that state — common; accept with attestation.
  const anyStateLicenses = provider.taxonomies
    .filter((t) => normalizeLicense(t.license || "").length > 0)
    .map((t) => `${t.state || "??"}:${t.license}`)
    .slice(0, 4);
  return {
    ok: true,
    matched: false,
    note: anyStateLicenses.length
      ? `CMS has licenses on file for other states (${anyStateLicenses.join(", ")}), but none for ${state}. Accepted with your attestation; state-board verification still pending.`
      : `CMS has no state license number on file for this NPI. Accepted with your attestation; state-board verification still pending.`,
  };
}
