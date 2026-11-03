import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Escenario H (HU-CRM-02): aplica las migraciones previas al rediseño sobre
// una base efímera, carga datos legacy representativos, aplica la migración
// estructural + backfill y valida el resultado. Re-ejecuta el backfill para
// comprobar idempotencia. Borra y recrea el schema `public`: SOLO acepta
// bases locales.
//
// Uso: MIGRATION_TEST_DATABASE_URL=postgresql://localhost/crm_migration_test \
//        npx tsx scripts/test-commercial-migration.ts

const FIRST_NEW_MIGRATION = "20261103120000_commercial_process_structure";
const BACKFILL_MIGRATION = "20261103120100_commercial_process_backfill";
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
const FIXTURE = path.join(
  process.cwd(),
  "scripts",
  "sql",
  "test-fixtures",
  "commercial-legacy.sql",
);

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      `MIGRATION_TEST_DATABASE_URL debe apuntar a localhost (recibido: ${host}).`,
    );
  }
}

function migrationSql(name: string) {
  return readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

type OpportunityRow = {
  id: string;
  stage_key: string;
  stage_active: boolean;
  status: string;
  legacy: string | null;
  review: string | null;
  won_at: Date | null;
  paused_at: Date | null;
  proposal_sent_at: Date | null;
  sprint0: string | null;
  channel: string | null;
};

async function legacyCounts(client: Client) {
  const result = await client.query<Record<string, string>>(`
    SELECT
      (SELECT COUNT(*) FROM opportunities) AS opportunities,
      (SELECT COUNT(*) FROM activities) AS activities,
      (SELECT COUNT(*) FROM notes) AS notes,
      (SELECT COUNT(*) FROM commercial_offers) AS offers,
      (SELECT COUNT(*) FROM opportunity_commercial_partners) AS partner_links,
      (SELECT COUNT(*) FROM inbound_leads) AS inbound,
      (SELECT COUNT(*) FROM workflows) AS workflows`);
  return result.rows[0];
}

async function snapshot(client: Client) {
  const opportunities = await client.query<OpportunityRow>(`
    SELECT o.id, s.key AS stage_key, s."isActive" AS stage_active, o.status,
           o."legacyStageKey" AS legacy, o."migrationReview" AS review,
           o."wonAt" AS won_at, o."pausedAt" AS paused_at,
           o."proposalSentAt" AS proposal_sent_at, o."sprint0Status" AS sprint0,
           a."sourceChannel" AS channel
    FROM opportunities o
    JOIN pipeline_stages s ON s.id = o."stageId"
    LEFT JOIN commercial_attributions a ON a.id = o."firstTouchAttributionId"
    ORDER BY o.id`);
  const counts = await client.query<Record<string, string>>(`
    SELECT
      (SELECT COUNT(*) FROM opportunities) AS opportunities,
      (SELECT COUNT(*) FROM activities) AS activities,
      (SELECT COUNT(*) FROM notes) AS notes,
      (SELECT COUNT(*) FROM commercial_offers) AS offers,
      (SELECT COUNT(*) FROM opportunity_commercial_partners) AS partner_links,
      (SELECT COUNT(*) FROM inbound_leads) AS inbound,
      (SELECT COUNT(*) FROM workflows) AS workflows,
      (SELECT COUNT(*) FROM pipeline_stages) AS stages,
      (SELECT COUNT(*) FROM opportunity_stage_history) AS history,
      (SELECT COUNT(*) FROM commercial_attributions) AS attributions,
      (SELECT COUNT(*) FROM timeline_events WHERE type = 'legacy_migration') AS migration_events`);
  return {
    opportunities: new Map(opportunities.rows.map((row) => [row.id, row])),
    counts: counts.rows[0],
  };
}

async function main() {
  const url = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!url) throw new Error("Falta MIGRATION_TEST_DATABASE_URL");
  assertLocal(url);

  const client = new Client({ connectionString: url });
  await client.connect();
  // Prisma guarda timestamp(3) sin zona como UTC; node-pg los lee como hora
  // local salvo que la sesión y el proceso estén en UTC.
  process.env.TZ = "UTC";
  await client.query("SET TIME ZONE 'UTC'");
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");

    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{14}_/.test(name))
      .sort();
    const previous = migrations.filter((name) => name < FIRST_NEW_MIGRATION);
    const redesign = migrations.filter((name) => name >= FIRST_NEW_MIGRATION);
    for (const name of previous) await client.query(migrationSql(name));
    await client.query(readFileSync(FIXTURE, "utf8"));
    const before = await legacyCounts(client);

    for (const name of redesign) {
      await client.query("BEGIN");
      await client.query(migrationSql(name));
      await client.query("COMMIT");
    }
    const after = await snapshot(client);

    // Sin pérdida: mismas filas en todas las entidades relacionadas.
    for (const key of [
      "opportunities",
      "activities",
      "notes",
      "offers",
      "partner_links",
      "inbound",
      "workflows",
    ]) {
      assert.equal(after.counts[key], before[key], `conteo ${key}`);
    }

    const op = (id: string) => {
      const row = after.opportunities.get(id);
      assert.ok(row, `falta ${id}`);
      return row;
    };
    const flags = (id: string) => (op(id).review ?? "").split(",");

    // Tablero: solo las 4 etapas operativas activas.
    const activeStages = await client.query<{ organizationId: string; keys: string }>(`
      SELECT "organizationId", string_agg(key, ',' ORDER BY "sortOrder") AS keys
      FROM pipeline_stages WHERE "isActive" GROUP BY 1`);
    for (const row of activeStages.rows) {
      assert.equal(
        row.keys,
        "reunion_discovery,calificada,propuesta_principal,negociacion",
        `etapas activas de ${row.organizationId}`,
      );
    }
    // Se reutiliza la fila existente (id preservado) de cada etapa operativa.
    const reused = await client.query(
      `SELECT id FROM pipeline_stages WHERE id IN ('a_disc','a_prop','a_neg','b_disc','b_neg') AND "isActive"`,
    );
    assert.equal(reused.rowCount, 5);

    assert.equal(op("op_won_open").status, "won");
    assert.equal(op("op_won_open").won_at?.toISOString(), "2026-09-01T10:00:00.000Z");
    assert.ok(flags("op_won_open").includes("won_stage_with_open_status"));

    assert.equal(op("op_lost_open").status, "lost");
    assert.ok(flags("op_lost_open").includes("lost_stage_with_open_status"));
    assert.ok(flags("op_lost_open").includes("lost_without_reason"));
    assert.equal(op("op_lost").review, null);

    // Congelado: pausada, conserva la etapa previa probada por el timeline.
    assert.equal(op("op_frozen_known").status, "paused");
    assert.equal(op("op_frozen_known").stage_key, "propuesta_principal");
    assert.equal(op("op_frozen_known").paused_at?.toISOString(), "2026-09-02T10:00:00.000Z");
    assert.equal(op("op_frozen_unknown").status, "paused");
    assert.equal(op("op_frozen_unknown").stage_key, "congelado");
    assert.ok(flags("op_frozen_unknown").includes("paused_previous_stage_unknown"));

    // Propuesta enviada solo con evidencia de envío.
    assert.equal(op("op_prop_sent").proposal_sent_at?.toISOString(), "2026-09-05T12:00:00.000Z");
    assert.equal(op("op_prop_unverified").proposal_sent_at, null);
    assert.ok(flags("op_prop_unverified").includes("proposal_sent_unverified"));

    // Diagnóstico -> Discovery, semántica Sprint 0 preservada sin fechas.
    assert.equal(op("op_s0").stage_key, "reunion_discovery");
    assert.equal(op("op_s0").sprint0, "accepted");
    assert.ok(flags("op_s0").includes("open_without_owner"));

    // Prospección: no se transforma en SQL; queda marcada para el backfill.
    assert.equal(op("op_lead").stage_active, false);
    assert.equal(op("op_lead").status, "open");
    assert.ok(flags("op_lead").includes("pending_prospecting_backfill"));
    assert.ok(flags("op_b_pilot").includes("retired_stage_unmapped"));

    // Atribución desde el texto legacy, sin inventar campaña.
    assert.equal(op("op_lead").channel, "referral");
    assert.equal(op("op_lead_project").channel, "linkedin_organic");
    assert.equal(op("op_b_won").channel, "partner");
    assert.equal(op("op_dup_1").channel, null);

    // Duplicados: se conservan ambos (solo se reportan).
    assert.ok(after.opportunities.has("op_dup_1") && after.opportunities.has("op_dup_2"));

    // Historial: fecha solo con evidencia de la misma etapa.
    const history = await client.query<{ opportunityId: string; enteredAt: Date | null }>(
      `SELECT "opportunityId", "enteredAt" FROM opportunity_stage_history`,
    );
    const entered = new Map(history.rows.map((row) => [row.opportunityId, row.enteredAt]));
    assert.equal(history.rowCount, Number(after.counts.opportunities));
    assert.equal(entered.get("op_dup_1")?.toISOString(), "2026-09-03T10:00:00.000Z");
    assert.equal(entered.get("op_frozen_known"), null);
    assert.equal(entered.get("op_s0"), null);

    // Workflows: advertencia explícita, no desactivados.
    const workflows = await client.query<{ id: string; isActive: boolean; configWarning: string | null }>(
      `SELECT id, "isActive", "configWarning" FROM workflows ORDER BY id`,
    );
    const byId = new Map(workflows.rows.map((row) => [row.id, row]));
    assert.equal(byId.get("wf_retired")?.isActive, true);
    assert.match(byId.get("wf_retired")?.configWarning ?? "", /sprint_0_ofrecido/);
    assert.equal(byId.get("wf_active")?.configWarning, null);

    // Idempotencia: re-ejecutar el backfill no cambia nada.
    await client.query("BEGIN");
    await client.query(migrationSql(BACKFILL_MIGRATION));
    await client.query("COMMIT");
    const again = await snapshot(client);
    assert.deepEqual(again.counts, after.counts);
    assert.deepEqual([...again.opportunities.values()], [...after.opportunities.values()]);

    console.log(
      `[commercial-migration] OK: ${after.counts.opportunities} oportunidades migradas sin pérdida, ${after.counts.migration_events} eventos de trazabilidad, backfill idempotente.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[commercial-migration] FAIL", error);
  process.exitCode = 1;
});
