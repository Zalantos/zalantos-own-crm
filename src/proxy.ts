import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Deny-by-default gate: every route not excluded by the matcher requires a
// session (see authConfig.callbacks.authorized). New routes are protected
// automatically, so nobody has to remember to nest them under (dashboard).
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    // api/meetings/process, api/telegram, api/mcp y
    // api/integrations/inbound-leads se autoprotegen con Bearer; el gate de
    // sesión los bloquearía antes de llegar a evaluar el token.
    // api/version solo devuelve el id de build para la barra de actualización.
    "/((?!api/auth|api/cron|api/telegram|api/mcp$|api/meetings/process$|api/integrations/inbound-leads$|api/version$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
