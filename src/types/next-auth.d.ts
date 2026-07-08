import { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    organizationId: string | null;
    isSuperAdmin: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      organizationId: string | null;
      isSuperAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: Role;
    organizationId?: string | null;
    isSuperAdmin?: boolean;
  }
}
