import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/session-cookie";

// only checks that the cookie exists, pages and actions still verify the session
export function proxy(request: NextRequest) {
  const isPageRequest = request.method === "GET" || request.method === "HEAD";
  if (!isPageRequest || request.cookies.has(sessionCookieName)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/auth/login", request.url));
}

// public scan pages and sign in stay open
export const config = { matcher: ["/dashboard/:path*", "/scan"] };
