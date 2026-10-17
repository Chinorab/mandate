import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  newSessionToken,
  sessionSecret,
  verifySession,
} from "@/lib/session/token";

/**
 * Gives every visitor a private demo session (signed cookie, no sign up). The database row is
 * created lazily by getSession(); the proxy never touches the database.
 */
export async function proxy(request: NextRequest) {
  const secret = sessionSecret();
  const current = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(current, secret)) return NextResponse.next();

  const { token } = await newSessionToken(secret);
  // Make the new cookie visible to this same request's server components and route handlers.
  request.cookies.set(SESSION_COOKIE, token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

export const config = {
  // Static files, icons and PayPal webhooks never get a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|api/webhooks).*)"],
};
