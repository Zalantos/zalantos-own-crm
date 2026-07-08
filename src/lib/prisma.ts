import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prismaSystem: PrismaClient | undefined;
  prismaTenantBase: PrismaClient | undefined;
};

// Cliente system: corre como el rol dueño de las tablas (exento de RLS por
// ser el owner). SOLO para auth, sesión, superadmin, crons y flujos de
// tokens. El código de features de tenant debe usar forOrg() de @/lib/tenant.
// DATABASE_URL es también la URL que usan las migraciones (prisma.config.ts),
// así que debe seguir siendo el rol con permisos de DDL.
const systemAdapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_SYSTEM ?? process.env.DATABASE_URL,
  max: Number(process.env.SYSTEM_DB_POOL_MAX ?? 5),
});

export const prismaSystem =
  globalForPrisma.prismaSystem ?? new PrismaClient({ adapter: systemAdapter });

// Cliente base para tráfico de tenant: corre como el rol de bajo privilegio
// crm_app (NOBYPASSRLS, sin DDL, sin grants sobre `organizations`) cuando
// TENANT_DATABASE_URL está configurada (ver scripts/sql/setup-roles.sql).
// Si no está seteada, cae al mismo rol que el cliente system — RLS deja de
// aplicar (el owner la bypassea) y el único aislamiento activo es el filtro
// de app en forOrg(), que ya es la barrera principal.
//
// Pool más grande que el de system: cada operación de forOrg() abre una
// transacción de 2 statements (SET LOCAL + query) para fijar
// app.current_org_id, y las páginas RSC disparan varias en paralelo vía
// Promise.all (el dashboard llega a ~12 concurrentes) — un pool chico agota
// conexiones y tira P2028 "Unable to start a transaction in the given time".
const tenantAdapter = new PrismaPg({
  connectionString:
    process.env.TENANT_DATABASE_URL ??
    process.env.DATABASE_URL_SYSTEM ??
    process.env.DATABASE_URL,
  max: Number(process.env.TENANT_DB_POOL_MAX ?? 15),
});

export const prismaTenantBase =
  globalForPrisma.prismaTenantBase ?? new PrismaClient({ adapter: tenantAdapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaSystem = prismaSystem;
  globalForPrisma.prismaTenantBase = prismaTenantBase;
}
