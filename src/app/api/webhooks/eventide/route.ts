import { NextResponse } from "next/server";
import { ingestRxHereWebhook } from "@/lib/eventide";

/**
 * Eventide Wellness Collective (VitaRelay) status webhooks.
 * Register: https://www.thewellnesstech.com/api/webhooks/eventide
 */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const result = await ingestRxHereWebhook(body, request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
