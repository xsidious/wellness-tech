import { NextResponse } from "next/server";

type Body = {
  email?: string;
  action?: "opt_out" | "subscribe";
  source?: string;
  marketingConsent?: boolean;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (body.action === "subscribe" && body.marketingConsent !== true) {
    return NextResponse.json(
      { error: "Marketing consent is required before we can add you to the list." },
      { status: 400 },
    );
  }

  const action = body.action === "subscribe" ? "subscribe" : "opt_out";
  const inbox = process.env.CONTACT_INBOX_EMAIL || "Admin@thewellnesstech.com";
  console.info("[email-preferences]", { action, email, source: body.source || "web", notify: inbox });

  if (action === "opt_out") {
    return NextResponse.json({
      message: "You are opted out of marketing emails. It can take a few days for all lists to update.",
    });
  }

  return NextResponse.json({
    message: "Thank you — you are subscribed to marketing updates. You can opt out anytime.",
  });
}
