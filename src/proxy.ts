import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/session-cookie";

/**
 * A first, central sign-in check for staff pages, so a new page cannot be left open by accident.
 * It only looks for the session cookie. Every page, download, and action still verifies the
 * session against the database, which is what actually grants access.
 */
export function proxy(request: NextRequest) {
  const isPageRequest = request.method === "GET" || request.method === "HEAD";
  if (!isPageRequest || request.cookies.has(sessionCookieName)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/auth/login", request.url));
}

// Staff pages and the staff scanner. Public QR pages (/scan/<code>) and sign-in stay open.
export const config = { matcher: ["/dashboard/:path*", "/scan"] };
