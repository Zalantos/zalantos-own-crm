import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Falla si alguna tabla con columna organizationId no tiene RLS habilitada
// o le falta la política tenant_isolation — para detectar el caso "se agregó
// un modelo nuevo y nadie extendió la migración de RLS". Correr después de
// aplicar migraciones: npx tsx scripts/check-rls-coverage.ts
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_SYSTEM ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const tablesWithOrgId = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'organizationId'
  `;

  const rlsStatus = await prisma.$queryRaw<
    { relname: string; relrowsecurity: boolean }[]
  >`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `;
  const rlsByTable = new Map(rlsStatus.map((r) => [r.relname, r.relrowsecurity]));

  const policies = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
  `;
  const tablesWithPolicy = new Set(policies.map((p) => p.tablename));

  const missing = tablesWithOrgId
    .map((t) => t.table_name)
    .filter((table) => table !== "organizations")
    .filter((table) => !rlsByTable.get(table) || !tablesWithPolicy.has(table));

  if (missing.length > 0) {
    console.error("[rls-coverage] Tablas con organizationId sin RLS/política completa:");
    for (const table of missing) console.error(`  - ${table}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[rls-coverage] OK: ${tablesWithOrgId.length - 1} tablas tenant con RLS + política.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
