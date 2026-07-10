import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

// Edge-safe config: no Prisma/bcrypt here so it can run in middleware.
// The Credentials provider (which needs Node APIs) lives in auth.ts.
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 10 }, // 10h
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname, origin } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isPublicLanding = pathname === "/";
      const isLoginPage = pathname === "/login";
      // Rutas públicas de provisioning: aceptar invitación y resetear password
      // se hacen sin sesión previa (el usuario todavía no puede loguearse).
      const isPublicTokenPage =
        pathname.startsWith("/invite/") || pathname.startsWith("/reset-password");

      if (isPublicLanding) return true;

      if (isLoginPage) {
        if (isLoggedIn) {
          return NextResponse.redirect(new URL("/dashboard", origin));
        }
        return true;
      }

      if (isPublicTokenPage) return true;

      if (!isLoggedIn) return false;

      const isSuperAdmin = auth.user.isSuperAdmin === true;
      const hasOrg = !!auth.user.organizationId;

      if (pathname.startsWith("/superadmin")) {
        if (!isSuperAdmin) {
          return NextResponse.redirect(new URL("/dashboard", origin));
        }
        return true;
      }

      // Super-admin sin organización propia (staff Zalantos puro) no opera
      // el CRM de ningún tenant.
      if (isSuperAdmin && !hasOrg) {
        return NextResponse.redirect(new URL("/superadmin", origin));
      }

      if (pathname.startsWith("/admin") && auth.user.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/companies", origin));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.isSuperAdmin = user.isSuperAdmin;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        // `token.role` reads as `unknown` here despite the JWT module
        // augmentation (Auth.js v5's session-callback `token` type doesn't
        // pick it up the same way the jwt-callback one does) — cast at the
        // read site instead of loosening the target type.
        session.user.role = (token.role as Role | undefined) ?? "MEMBER";
        session.user.organizationId =
          (token.organizationId as string | null | undefined) ?? null;
        session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
