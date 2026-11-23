import { resolveEventideIssuePlan, listPrescribers, eventideConfigured } from "../src/lib/eventide";

async function main() {
  console.log("configured", eventideConfigured());
  for (const state of ["PA", "FL", "TX", "CA"]) {
    const plan = await resolveEventideIssuePlan({ state });
    console.log(state, JSON.stringify(plan));
  }
  const roster = await listPrescribers();
  console.log("prescribers", roster.ok, roster.status);
  const data = (roster.data as { data?: unknown })?.data ?? roster.data;
  const rows = Array.isArray(data)
    ? data
    : ((data as { prescribers?: unknown[]; items?: unknown[] })?.prescribers ||
        (data as { items?: unknown[] })?.items ||
        []);
  console.log(
    "roster",
    rows.slice(0, 8).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id,
        name: row.full_name || row.name,
        npi: row.npi_number,
        state: row.license_state || row.licenses,
      };
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
