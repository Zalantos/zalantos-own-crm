import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Deny-by-default gate: every route not excluded by the matcher requires a
// session (see authConfig.callbacks.authorized). New routes are protected
// automatically, so nobody has to remember to nest them under (dashboard).
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
