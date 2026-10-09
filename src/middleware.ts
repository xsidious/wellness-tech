import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clientIp, rateLimit, securityHeaders } from "@/lib/anti-bot";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ip = clientIp(req);

  // Hard rate-limit auth endpoints / login posts
  if (
    path === "/login" ||
    path === "/admin/login" ||
    path === "/signup" ||
    path.startsWith("/api/")
  ) {
    const limited = rateLimit(`wt:${ip}:${path}`, path.startsWith("/api/") ? 120 : 30, 60_000);
    if (!limited.ok) {
      return new NextResponse("Too many requests. Slow down.", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  }

  const res = NextResponse.next();
  securityHeaders(res);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
