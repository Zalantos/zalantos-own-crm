import { prismaSystem } from "@/lib/prisma";

// Validación de solo lectura del proceso comercial (HU-CRM-02). Correr antes
// y después de migrar para comparar. Sale con código 1 si hay violaciones de
// integridad (cruces entre organizaciones, etapas inválidas); las banderas
// de revisión y duplicados se informan pero no fallan.
//
//   npx tsx scripts/validate-commercial-process.ts [--organization-id <id>]

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function tableExists(name: string) {
  const rows = await prismaSystem.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${name}) AS exists`;
  return rows[0]?.exists ?? false;
}

async function main() {
  const organizationId = arg("organization-id");
  const orgFilter = organizationId ? `AND o."organizationId" = '${organizationId.replace(/'/g, "''")}'` : "";
  const migrated = await tableExists("commercial_leads");
  console.log(`[validate] esquema ${migrated ? "con" : "SIN"} rediseño comercial`);

  const stages = await prismaSystem.$queryRawUnsafe<{ org: string; key: string; active: boolean; status: string; n: bigint }[]>(`
    SELECT o."organizationId" AS org, s.key, s."isActive" AS active, o.status, COUNT(*) AS n
    FROM opportunities o JOIN pipeline_stages s ON s.id = o."stageId"
    WHERE true ${orgFilter}
    GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 4`);
  console.table(stages.map((row) => ({ ...row, n: Number(row.n) })));

  const duplicates = await prismaSystem.$queryRawUnsafe<{ org: string; company: string; name: string; n: bigint }[]>(`
    SELECT o."organizationId" AS org, c.name AS company, lower(btrim(o.name)) AS name, COUNT(*) AS n
    FROM opportunities o JOIN companies c ON c.id = o."companyId"
    WHERE true ${orgFilter}
    GROUP BY 1, 2, 3 HAVING COUNT(*) > 1`);
  console.log(`[validate] posibles duplicados (empresa + nombre): ${duplicates.length}`);
  if (duplicates.length) console.table(duplicates.map((row) => ({ ...row, n: Number(row.n) })));

  const violations: string[] = [];
  const crossStage = await prismaSystem.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT COUNT(*) AS n FROM opportunities o JOIN pipeline_stages s ON s.id = o."stageId"
    WHERE s."organizationId" <> o."organizationId" ${orgFilter}`);
  if (Number(crossStage[0]?.n ?? 0) > 0) violations.push(`${crossStage[0]?.n} oportunidades con etapa de otra org`);

  if (migrated) {
    const flags = await prismaSystem.$queryRawUnsafe<{ flag: string; n: bigint }[]>(`
      SELECT unnest(string_to_array(o."migrationReview", ',')) AS flag, COUNT(*) AS n
      FROM opportunities o WHERE o."migrationReview" IS NOT NULL ${orgFilter} GROUP BY 1 ORDER BY 2 DESC`);
    console.log("[validate] banderas de revisión post-migración");
    console.table(flags.map((row) => ({ ...row, n: Number(row.n) })));

    const crossChecks: [string, string][] = [
      ["leads con empresa de otra org", `SELECT COUNT(*) AS n FROM commercial_leads l JOIN companies c ON c.id = l."companyId" WHERE c."organizationId" <> l."organizationId"`],
      ["leads con persona de otra org", `SELECT COUNT(*) AS n FROM commercial_leads l JOIN people p ON p.id = l."personId" WHERE p."organizationId" <> l."organizationId"`],
      ["oportunidades con lead de otra org", `SELECT COUNT(*) AS n FROM opportunities o JOIN commercial_leads l ON l.id = o."commercialLeadId" WHERE l."organizationId" <> o."organizationId"`],
      ["oportunidades con atribución de otra org", `SELECT COUNT(*) AS n FROM opportunities o JOIN commercial_attributions a ON a.id = o."firstTouchAttributionId" WHERE a."organizationId" <> o."organizationId"`],
      ["atribuciones con partner de otra org", `SELECT COUNT(*) AS n FROM commercial_attributions a JOIN commercial_partners p ON p.id = a."referrerPartnerId" WHERE p."organizationId" <> a."organizationId"`],
      ["actividades con lead de otra org", `SELECT COUNT(*) AS n FROM activities a JOIN commercial_leads l ON l.id = a."commercialLeadId" WHERE l."organizationId" <> a."organizationId"`],
      ["historial de etapas de otra org", `SELECT COUNT(*) AS n FROM opportunity_stage_history h JOIN opportunities o ON o.id = h."opportunityId" WHERE o."organizationId" <> h."organizationId"`],
      ["traspasos Rumbo de otra org", `SELECT COUNT(*) AS n FROM rumbo_handoffs r JOIN opportunities o ON o.id = r."opportunityId" WHERE o."organizationId" <> r."organizationId"`],
      ["abiertas en etapa terminal", `SELECT COUNT(*) AS n FROM opportunities o JOIN pipeline_stages s ON s.id = o."stageId" WHERE o.status = 'open' AND (s."isWon" OR s."isLost")`],
    ];
    for (const [label, sql] of crossChecks) {
      const rows = await prismaSystem.$queryRawUnsafe<{ n: bigint }[]>(sql);
      const count = Number(rows[0]?.n ?? 0);
      if (count > 0) violations.push(`${count} ${label}`);
    }

    const withoutHistory = await prismaSystem.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT COUNT(*) AS n FROM opportunities o
      WHERE NOT EXISTS (SELECT 1 FROM opportunity_stage_history h WHERE h."opportunityId" = o.id) ${orgFilter}`);
    console.log(`[validate] oportunidades sin historial de etapa (creadas fuera de la app): ${Number(withoutHistory[0]?.n ?? 0)}`);

    const warnings = await prismaSystem.workflow.count({ where: { configWarning: { not: null } } });
    console.log(`[validate] workflows con advertencia de configuración: ${warnings}`);
    const health = await prismaSystem.opportunity.groupBy({
      by: ["organizationId"],
      where: {
        status: "open",
        ...(organizationId ? { organizationId } : {}),
        OR: [{ ownerId: null }, { nextStep: null }, { nextStepDueDate: null }],
      },
      _count: { _all: true },
    });
    console.log("[validate] abiertas incompletas (sin responsable o próxima acción fechada)");
    console.table(health.map((row) => ({ org: row.organizationId, n: row._count._all })));
  }

  if (violations.length) {
    console.error("[validate] VIOLACIONES:");
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("[validate] OK: sin violaciones de integridad.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prismaSystem.$disconnect());
