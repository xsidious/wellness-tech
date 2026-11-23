/**
 * Retry VitaRelay placement for WT-2026-0020 after RND placement fix.
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { resolve } from "path";

const require = createRequire(import.meta.url);

// Load compiled TS via tsx if available; else dynamic import of source through next/tsx.
async function main() {
  const { register } = await import("node:module");
  try {
    const { pathToFileURL: toUrl } = await import("node:url");
    register("tsx/esm", toUrl("./"));
  } catch {
    // fall through — use npx tsx runner instead
  }

  const { retryEventideSubmission } = await import(
    pathToFileURL(resolve("src/lib/rxcore.ts")).href
  );
  const { prisma } = await import(pathToFileURL(resolve("src/lib/prisma.ts")).href);

  const order = await prisma.order.findFirst({ where: { invoiceNumber: "WT-2026-0020" } });
  if (!order) {
    console.log("missing order");
    return;
  }
  console.log("before", {
    id: order.id,
    status: order.status,
    rxcoreOrderId: order.rxcoreOrderId,
    eventideOrderId: order.eventideOrderId,
    placementError: order.placementError,
  });

  const result = await retryEventideSubmission(order.id);
  console.log("retry", result);

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      status: true,
      rxcoreOrderId: true,
      eventideOrderId: true,
      placementError: true,
      splitMessage: true,
      escriptStatus: true,
    },
  });
  console.log("after", after);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
});
