import { syncPrescribeUsaCatalog } from "../src/lib/formulary-sync";

async function main() {
  // Dynamic import delete script logic inline via spawn order: run delete first separately.
  const result = await syncPrescribeUsaCatalog("script");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
