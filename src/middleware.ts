import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clientIp, rateLimit, securityHeaders } from "@/lib/anti-bot";

const PROBE_RE =
  /(\.env|\.git|wp-admin|wp-login|phpmyadmin|xmlrpc\.php|\/\.aws|\/vendor\/phpunit|\/\.vscode|\/\.DS_Store)/i;

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ip = clientIp(req);

  // Drop obvious scanner / probe traffic early.
  if (PROBE_RE.test(path)) {
    return new NextResponse(null, { status: 404 });
  }

  // Hard rate-limit auth surfaces and APIs (stricter on login/signup).
  const isAuthPage = path === "/login" || path === "/admin/login" || path === "/signup";
  if (isAuthPage || path.startsWith("/api/")) {
    const authBudget = req.method === "POST" || req.method === "PUT" || req.method === "PATCH" ? 12 : 20;
    const limited = rateLimit(
      `wt:${ip}:${isAuthPage ? `auth:${req.method}` : path}`,
      path.startsWith("/api/") ? 90 : authBudget,
      60_000,
    );
    if (!limited.ok) {
      return new NextResponse("Too many requests. Slow down.", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  }

  const res = NextResponse.next();
  securityHeaders(res);
  // Reduce MIME / cache leakage on auth pages.
  if (isAuthPage) {
    res.headers.set("Cache-Control", "no-store, max-age=0");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
