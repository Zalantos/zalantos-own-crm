import { cache } from "react";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prismaSystem, prismaTenantBase } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/session";

// Aislamiento multi-tenant en dos capas:
// 1. Filtro de app (siempre activo): forOrg() inyecta organizationId en el
//    where de toda operación (incluidas las por id) y lo fuerza en los datos
//    de create/update, de modo que una fila ajena es invisible (find ->
//    null, update/delete -> P2025) y no se puede escribir fuera de la org.
// 2. RLS de Postgres (activa solo si TENANT_DATABASE_URL está configurada,
//    ver scripts/sql/setup-roles.sql + migración enable_row_level_security):
//    cada operación corre en una transacción de 2 statements que fija
//    app.current_org_id antes de la query; las políticas RLS usan ese valor
//    como segunda barrera. El rol dueño (usado si TENANT_DATABASE_URL no
//    está seteada) bypassea RLS automáticamente, así que ahí el wrapper no
//    aportaría nada — por eso queda gateado por RLS_ENFORCED en vez de
//    correr siempre.
//
// OJO con el costo: un $transaction por operación reserva una conexión
// pooled durante toda su duración, y páginas RSC disparan varias
// operaciones concurrentes vía Promise.all (el dashboard llega a ~12). El
// pool de prismaTenantBase (src/lib/prisma.ts, TENANT_DB_POOL_MAX) está
// dimensionado para eso — si se agrega una página con más fan-out todavía,
// hay que resubir el pool o repensar el patrón antes de que reaparezca
// "P2028 Unable to start a transaction in the given time".
const RLS_ENFORCED = Boolean(process.env.TENANT_DATABASE_URL);

type WriteData = Record<string, unknown>;

type ScopedArgs = {
  where?: Record<string, unknown>;
  data?: WriteData | WriteData[];
  create?: WriteData;
  update?: WriteData;
};

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

function forceOrgOnData(data: WriteData, orgId: string) {
  // Evita el conflicto "organization y organizationId a la vez" y garantiza
  // que nadie escriba en otra org.
  delete data.organization;
  data.organizationId = orgId;
}

function injectOrgScope(
  model: string,
  operation: string,
  args: ScopedArgs,
  orgId: string,
) {
  // El código de tenant nunca debe tocar organizations directamente; la org
  // viene del contexto (requireOrgContext) vía cliente system.
  if (model === "Organization") {
    throw new Error(
      "No uses db.organization desde código de tenant; la org viene de requireOrgContext().",
    );
  }

  if (WHERE_OPERATIONS.has(operation)) {
    args.where = { ...(args.where ?? {}), organizationId: orgId };
  }

  if (operation === "upsert") {
    args.where = { ...(args.where ?? {}), organizationId: orgId };
    if (args.create) forceOrgOnData(args.create, orgId);
    if (args.update) delete args.update.organizationId;
  }

  if (operation === "create") {
    if (args.data && !Array.isArray(args.data)) forceOrgOnData(args.data, orgId);
  }

  if (operation === "createMany" || operation === "createManyAndReturn") {
    if (Array.isArray(args.data)) {
      for (const row of args.data) forceOrgOnData(row, orgId);
    } else if (args.data) {
      forceOrgOnData(args.data, orgId);
    }
  }

  if (operation === "update" || operation === "updateMany") {
    if (args.data && !Array.isArray(args.data)) {
      delete args.data.organizationId;
      delete args.data.organization;
    }
  }
}

export function forOrg(orgId: string) {
  return prismaTenantBase.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          injectOrgScope(model, operation, args as ScopedArgs, orgId);
          if (!RLS_ENFORCED) return query(args);
          // set_config(..., true) es local a la transacción: se descarta al
          // terminar, seguro de reusar con un pool de conexiones.
          const [, result] = await prismaTenantBase.$transaction([
            prismaTenantBase.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forOrg>;

// Transacción interactiva scopeada: el callback recibe un TransactionClient
// crudo (sin el wrapper de forOrg), así que los callers deben pasar
// organizationId explícitamente en cada where/data dentro de `fn`. Ya es una
// transacción, así que fijar app.current_org_id acá no cuesta una conexión
// extra (a diferencia de forOrg()).
export async function withOrgTransaction<T>(
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prismaTenantBase.$transaction(async (tx) => {
    if (RLS_ENFORCED) {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    }
    return fn(tx);
  });
}

// Cacheado por request (React cache) para no repetir la lectura de settings.
export const getOrgSettings = cache(async (orgId: string) => {
  return prismaSystem.organization.findUnique({
    where: { id: orgId },
  });
});

export type OrgSettings = NonNullable<Awaited<ReturnType<typeof getOrgSettings>>>;

// Punto de entrada estándar para server actions y páginas RSC de tenant:
// usuario autenticado + settings de su org + cliente scoped.
export async function requireOrgContext() {
  const user = await requireUser();
  // Un super-admin sin org no opera el CRM de ningún tenant.
  if (!user.organizationId) {
    redirect("/superadmin");
  }
  const org = await getOrgSettings(user.organizationId);
  if (!org || !org.isActive) {
    redirect("/login");
  }
  return { user, org, db: forOrg(org.id) };
}

// Variante para route handlers (devuelve null en vez de redirect; el handler
// responde 401).
export async function getOrgContext() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser?.id) return null;

  const dbUser = await prismaSystem.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      organizationId: true,
      isSuperAdmin: true,
    },
  });
  if (!dbUser?.isActive || !dbUser.organizationId) return null;

  const org = await getOrgSettings(dbUser.organizationId);
  if (!org || !org.isActive) return null;

  return { user: dbUser, org, db: forOrg(org.id) };
}

export type OrgContext = Awaited<ReturnType<typeof requireOrgContext>>;

// Igual que requireOrgContext pero exige rol ADMIN dentro de la org.
export async function requireOrgAdminContext() {
  const ctx = await requireOrgContext();
  if (ctx.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return ctx;
}
