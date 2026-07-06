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
      const isLoginPage = pathname === "/login";

      if (isLoginPage) {
        if (isLoggedIn) {
          return NextResponse.redirect(new URL("/dashboard", origin));
        }
        return true;
      }

      if (!isLoggedIn) return false;

      if (pathname.startsWith("/admin") && auth.user.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/companies", origin));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
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
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
