import { NextResponse } from "next/server";

export function GET() {
  const body = [
    "Contact: mailto:Admin@thewellnesstech.com",
    "Expires: 2027-12-31T23:59:59.000Z",
    "Preferred-Languages: en",
    "Canonical: https://wellnesstechdist.vercel.app/.well-known/security.txt",
    "Policy: https://wellnesstechdist.vercel.app/compliance",
  ].join("\n");

  return new NextResponse(`${body}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
