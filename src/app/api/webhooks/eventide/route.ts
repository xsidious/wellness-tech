import { NextResponse } from "next/server";
import { ingestEventideWebhook } from "@/lib/eventide";

/**
 * Eventide Wellness Collective (VitaRelay) status webhooks.
 * Register: https://www.wellnesstechdistribution.com/api/webhooks/eventide
 */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const result = await ingestEventideWebhook(body, request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
