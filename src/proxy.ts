import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Deny-by-default gate: every route not excluded by the matcher requires a
// session (see authConfig.callbacks.authorized). New routes are protected
// automatically, so nobody has to remember to nest them under (dashboard).
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    // api/meetings/process y api/telegram se autoprotegen con un Bearer
    // compartido (worker/n8n sin sesión), igual que api/cron — el gate de
    // sesión los bloquearía antes de llegar a evaluar el token.
    "/((?!api/auth|api/cron|api/telegram|api/meetings/process$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
