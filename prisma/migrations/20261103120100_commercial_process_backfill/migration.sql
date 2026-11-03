-- Rediseño del proceso comercial (HU-CRM-02) — BACKFILL determinístico.
--
-- Reglas (ver docs/operations/commercial-process-migration.md):
-- * No borra filas. Las etapas que salen del tablero se retiran
--   (isActive=false) y conservan su id, key y oportunidades.
-- * Reutiliza por key las filas reunion_discovery / propuesta_principal /
--   negociacion (preserva ids usados por workflows y keys usadas por el
--   historial de cambios IA) y crea calificada si falta.
-- * No inventa fechas: wonAt / lostAt / pausedAt / enteredAt solo se
--   completan con un evento stage_changed del timeline que lo pruebe.
-- * Las oportunidades en etapas de prospección (lead_identificado,
--   investigacion_realizada, primer_contacto) NO se transforman acá: quedan
--   marcadas para el backfill controlado scripts/backfill-commercial-process.ts.
-- * Idempotente: re-ejecutarla no cambia el resultado (las condiciones
--   filtran filas ya procesadas).
-- * Valida al final y aborta (rollback) si queda alguna inconsistencia.

-- Acumula banderas de revisión separadas por coma sin repetirlas.
CREATE OR REPLACE FUNCTION pg_temp.cp_flag(current_flags TEXT, flag TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN current_flags IS NULL OR current_flags = '' THEN flag
    WHEN flag = ANY (string_to_array(current_flags, ',')) THEN current_flags
    ELSE current_flags || ',' || flag
  END
$$;

CREATE TEMP TABLE _cp_stage_map (
  organization_id TEXT NOT NULL,
  stage_id        TEXT NOT NULL PRIMARY KEY,
  old_key         TEXT NOT NULL,
  old_label       TEXT NOT NULL,
  old_is_won      BOOLEAN NOT NULL,
  old_is_lost     BOOLEAN NOT NULL,
  -- active | won | lost | paused | diagnosis | prospecting | unmapped
  stage_group     TEXT NOT NULL,
  target_key      TEXT,
  target_stage_id TEXT
) ON COMMIT DROP;

INSERT INTO _cp_stage_map (organization_id, stage_id, old_key, old_label, old_is_won, old_is_lost, stage_group, target_key)
SELECT
  s."organizationId", s.id, s.key, s.label, s."isWon", s."isLost",
  CASE
    WHEN s.key IN ('reunion_discovery', 'calificada', 'propuesta_principal', 'negociacion') THEN 'active'
    WHEN s."isWon" OR s.key = 'ganado' THEN 'won'
    WHEN s."isLost" OR s.key = 'perdido' THEN 'lost'
    WHEN s.key = 'congelado' OR s.label ILIKE 'congelad%' THEN 'paused'
    WHEN s.key IN ('dolor_validado', 'sprint_0_ofrecido', 'sprint_0_aceptado', 'diagnostico_realizado') THEN 'diagnosis'
    WHEN s.key IN ('lead_identificado', 'investigacion_realizada', 'primer_contacto') THEN 'prospecting'
    ELSE 'unmapped'
  END,
  CASE
    WHEN s.key IN ('reunion_discovery', 'calificada', 'propuesta_principal', 'negociacion') THEN s.key
    WHEN s.key IN ('dolor_validado', 'sprint_0_ofrecido', 'sprint_0_aceptado', 'diagnostico_realizado') THEN 'reunion_discovery'
    ELSE NULL
  END
FROM "pipeline_stages" s;

-- ---------------------------------------------------------------------------
-- 1. Etapas: 4 etapas operativas activas por organización.
-- ---------------------------------------------------------------------------

-- Libera sortOrder 0..3 (unique por org) antes de reordenar.
UPDATE "pipeline_stages" SET "sortOrder" = "sortOrder" + 1000 WHERE "sortOrder" < 1000;

INSERT INTO "pipeline_stages" ("id", "organizationId", "key", "label", "sortOrder", "isWon", "isLost", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o.id, t.key, t.label, 2000 + t.ord, false, false, true, NOW(), NOW()
FROM "organizations" o
CROSS JOIN (VALUES
  ('reunion_discovery', 'Discovery / Sprint 0', 0),
  ('calificada', 'Calificada', 1),
  ('propuesta_principal', 'Propuesta enviada', 2),
  ('negociacion', 'Negociación', 3)
) AS t(key, label, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM "pipeline_stages" s WHERE s."organizationId" = o.id AND s.key = t.key
);

UPDATE "pipeline_stages" s
SET "label" = t.label, "sortOrder" = t.ord, "isActive" = true, "isWon" = false, "isLost" = false, "updatedAt" = NOW()
FROM (VALUES
  ('reunion_discovery', 'Discovery / Sprint 0', 0),
  ('calificada', 'Calificada', 1),
  ('propuesta_principal', 'Propuesta enviada', 2),
  ('negociacion', 'Negociación', 3)
) AS t(key, label, ord)
WHERE s.key = t.key;

-- El resto se retira (no se borra) y queda detrás del flujo activo,
-- conservando su orden relativo.
WITH ranked AS (
  SELECT id, 100 + ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "sortOrder", key) AS ord
  FROM "pipeline_stages"
  WHERE key NOT IN ('reunion_discovery', 'calificada', 'propuesta_principal', 'negociacion')
)
UPDATE "pipeline_stages" s
SET "isActive" = false, "sortOrder" = ranked.ord, "updatedAt" = NOW()
FROM ranked
WHERE s.id = ranked.id;

UPDATE _cp_stage_map m
SET target_stage_id = s.id
FROM "pipeline_stages" s
WHERE s."organizationId" = m.organization_id AND s.key = m.target_key;

-- ---------------------------------------------------------------------------
-- 2. Oportunidades: etapa / estado según evidencia.
-- ---------------------------------------------------------------------------

-- Etapa original (solo la primera vez).
UPDATE "opportunities" o
SET "legacyStageKey" = m.old_key
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id AND o."legacyStageKey" IS NULL;

-- Último evento stage_changed que llevó a la oportunidad a su etapa legacy
-- (summary "<antes> → <después>" escrito por la app y por apply.ts).
CREATE TEMP TABLE _cp_entry_evidence ON COMMIT DROP AS
SELECT DISTINCT ON (o.id)
  o.id AS opportunity_id,
  e."occurredAt" AS entered_at,
  NULLIF(split_part(e.summary, ' → ', 1), '') AS previous_label
FROM "opportunities" o
JOIN _cp_stage_map m ON m.stage_id = o."stageId"
JOIN "timeline_events" e
  ON e."opportunityId" = o.id
 AND e.type = 'stage_changed'
 AND e."organizationId" = o."organizationId"
 AND e.summary LIKE '% → ' || m.old_label
ORDER BY o.id, e."occurredAt" DESC;

-- 2a. Etapa ganada: status=won (incluye el caso inconsistente status=open).
UPDATE "opportunities" o
SET "status" = 'won',
    "wonAt" = COALESCE(o."wonAt", (SELECT ev.entered_at FROM _cp_entry_evidence ev WHERE ev.opportunity_id = o.id)),
    "migrationReview" = pg_temp.cp_flag(o."migrationReview", 'won_stage_with_open_status')
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id AND m.stage_group = 'won' AND o.status = 'open';

UPDATE "opportunities" o
SET "wonAt" = ev.entered_at
FROM _cp_stage_map m, _cp_entry_evidence ev
WHERE o."stageId" = m.stage_id AND m.stage_group = 'won' AND o.status = 'won'
  AND o."wonAt" IS NULL AND ev.opportunity_id = o.id;

-- 2b. Etapa perdida: status=lost. Sin motivo -> queda nulo y se marca.
UPDATE "opportunities" o
SET "status" = 'lost',
    "migrationReview" = pg_temp.cp_flag(o."migrationReview", 'lost_stage_with_open_status')
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id AND m.stage_group = 'lost' AND o.status = 'open';

UPDATE "opportunities" o
SET "lostAt" = ev.entered_at
FROM _cp_stage_map m, _cp_entry_evidence ev
WHERE o."stageId" = m.stage_id AND m.stage_group = 'lost' AND o.status = 'lost'
  AND o."lostAt" IS NULL AND ev.opportunity_id = o.id;

UPDATE "opportunities"
SET "migrationReview" = pg_temp.cp_flag("migrationReview", 'lost_without_reason')
WHERE status = 'lost' AND "lossReason" IS NULL;

-- Ganada/perdida en etapa del estado contrario: conflicto, no se adivina.
UPDATE "opportunities" o
SET "migrationReview" = pg_temp.cp_flag(o."migrationReview", 'status_stage_conflict')
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id
  AND ((m.stage_group = 'won' AND o.status = 'lost') OR (m.stage_group = 'lost' AND o.status = 'won'));

-- 2c. Congelado -> paused, conservando la última etapa comercial real cuando
-- el timeline la prueba ("<etapa previa> → Congelado").
CREATE TEMP TABLE _cp_paused_previous ON COMMIT DROP AS
SELECT DISTINCT ON (ev.opportunity_id) ev.opportunity_id, prev.target_stage_id
FROM _cp_entry_evidence ev
JOIN "opportunities" o ON o.id = ev.opportunity_id
JOIN _cp_stage_map prev
  ON prev.organization_id = o."organizationId"
 AND prev.old_label = ev.previous_label
 AND prev.target_stage_id IS NOT NULL
ORDER BY ev.opportunity_id, prev.target_key;

UPDATE "opportunities" o
SET "status" = 'paused',
    "pausedAt" = COALESCE(o."pausedAt", (SELECT ev.entered_at FROM _cp_entry_evidence ev WHERE ev.opportunity_id = o.id)),
    "pauseReason" = COALESCE(o."pauseReason", 'Migrado desde la etapa legacy "' || m.old_label || '" (motivo original no registrado).'),
    "stageId" = COALESCE((SELECT p.target_stage_id FROM _cp_paused_previous p WHERE p.opportunity_id = o.id), o."stageId"),
    "migrationReview" = pg_temp.cp_flag(o."migrationReview", CASE
      WHEN EXISTS (SELECT 1 FROM _cp_paused_previous p WHERE p.opportunity_id = o.id) THEN 'paused_missing_reactivation'
      ELSE 'paused_previous_stage_unknown' END)
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id AND m.stage_group = 'paused' AND o.status = 'open';

-- 2d. Etapas de diagnóstico -> Discovery / Sprint 0, conservando la
-- semántica del Sprint 0 (sin fechas: no hay evidencia).
UPDATE "opportunities" o
SET "sprint0Status" = COALESCE(o."sprint0Status", CASE m.old_key
      WHEN 'sprint_0_ofrecido' THEN 'offered'
      WHEN 'sprint_0_aceptado' THEN 'accepted'
      WHEN 'diagnostico_realizado' THEN 'done'
      ELSE NULL END),
    "stageId" = m.target_stage_id
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id AND m.stage_group = 'diagnosis' AND m.target_stage_id IS NOT NULL;

-- 2e. Propuesta: "enviada" solo si hay una oferta con fecha de envío.
UPDATE "opportunities" o
SET "proposalSentAt" = sent.first_sent
FROM (
  SELECT "opportunityId", MIN("sentAt") AS first_sent
  FROM "commercial_offers"
  WHERE "sentAt" IS NOT NULL
  GROUP BY "opportunityId"
) sent, "pipeline_stages" s
WHERE sent."opportunityId" = o.id AND s.id = o."stageId"
  AND s.key IN ('propuesta_principal', 'negociacion') AND o."proposalSentAt" IS NULL;

UPDATE "opportunities" o
SET "migrationReview" = pg_temp.cp_flag(o."migrationReview", 'proposal_sent_unverified')
FROM "pipeline_stages" s
WHERE s.id = o."stageId" AND s.key = 'propuesta_principal'
  AND o.status = 'open' AND o."proposalSentAt" IS NULL;

-- 2f. Prospección y etapas sin mapeo: no se mueven; se marcan.
UPDATE "opportunities" o
SET "migrationReview" = pg_temp.cp_flag(o."migrationReview", 'pending_prospecting_backfill')
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id AND m.stage_group = 'prospecting' AND o.status = 'open';

UPDATE "opportunities" o
SET "migrationReview" = pg_temp.cp_flag(o."migrationReview", 'retired_stage_unmapped')
FROM _cp_stage_map m
WHERE o."stageId" = m.stage_id AND m.stage_group = 'unmapped' AND o.status IN ('open', 'paused');

UPDATE "opportunities"
SET "migrationReview" = pg_temp.cp_flag("migrationReview", 'unknown_status')
WHERE status NOT IN ('open', 'paused', 'won', 'lost', 'archived');

-- Abiertas sin responsable: no se asigna a nadie, se señala.
UPDATE "opportunities"
SET "migrationReview" = pg_temp.cp_flag("migrationReview", 'open_without_owner')
WHERE status = 'open' AND "ownerId" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Historial de etapas: un período abierto por oportunidad.
-- ---------------------------------------------------------------------------
INSERT INTO "opportunity_stage_history" ("id", "organizationId", "opportunityId", "stageId", "stageKey", "stageLabel", "enteredAt", "exitedAt", "source", "reason", "createdAt")
SELECT gen_random_uuid()::text, o."organizationId", o.id, s.id, s.key, s.label,
       CASE WHEN s.key = o."legacyStageKey" THEN ev.entered_at ELSE NULL END, NULL, 'migration',
       'Período inicial creado por el rediseño comercial; enteredAt nulo = fecha desconocida.',
       NOW()
FROM "opportunities" o
JOIN "pipeline_stages" s ON s.id = o."stageId"
LEFT JOIN _cp_entry_evidence ev ON ev.opportunity_id = o.id
WHERE NOT EXISTS (
  SELECT 1 FROM "opportunity_stage_history" h WHERE h."opportunityId" = o.id
);

UPDATE "opportunities" o
SET "stageEnteredAt" = h."enteredAt"
FROM "opportunity_stage_history" h
WHERE h."opportunityId" = o.id AND h."exitedAt" IS NULL AND o."stageEnteredAt" IS NULL AND h."enteredAt" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Atribución: Opportunity.source (texto libre) -> primer toque.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _cp_source_attr ON COMMIT DROP AS
SELECT o.id AS opportunity_id, o."organizationId" AS organization_id, o.source,
       gen_random_uuid()::text AS attribution_id,
       CASE
         WHEN lower(o.source) ~ '(referid|referral|recomend)' THEN 'referral'
         WHEN lower(o.source) ~ '(partner|alianza|aliado)' THEN 'partner'
         WHEN lower(o.source) ~ '(campa|campaign|ads|anuncio)' THEN 'campaign'
         WHEN lower(o.source) ~ '(linkedin)' THEN 'linkedin_organic'
         WHEN lower(o.source) ~ '(web|website|landing|formulario|inbound|sitio)' THEN 'web'
         WHEN lower(o.source) ~ '(evento|event|feria|conferencia|webinar)' THEN 'event'
         WHEN lower(o.source) ~ '(outbound|prospec|cold|frío|frio)' THEN 'outbound'
         ELSE 'other'
       END AS channel
FROM "opportunities" o
WHERE o.source IS NOT NULL AND btrim(o.source) <> '' AND o."firstTouchAttributionId" IS NULL;

INSERT INTO "commercial_attributions" ("id", "organizationId", "sourceChannel", "sourceDetail", "method", "createdAt")
SELECT attribution_id, organization_id, channel, source, 'migration', NOW() FROM _cp_source_attr;

UPDATE "opportunities" o
SET "firstTouchAttributionId" = a.attribution_id
FROM _cp_source_attr a
WHERE a.opportunity_id = o.id;

-- ---------------------------------------------------------------------------
-- 5. Workflows con condiciones sobre etapas retiradas: advertencia visible,
-- no se desactivan ni se reescriben en silencio.
-- ---------------------------------------------------------------------------
UPDATE "workflows" w
SET "configWarning" = 'Rediseño comercial: la condición usa etapas retiradas del tablero (' || retired.keys || '). El workflow sigue activo pero no se disparará hasta que actualices la condición a una etapa activa (reunion_discovery, calificada, propuesta_principal, negociacion) o al evento status_changed.',
    "updatedAt" = NOW()
FROM (
  SELECT w2.id, string_agg(DISTINCT m.old_key, ', ') AS keys
  FROM "workflows" w2
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w2."conditionsJson") = 'array' THEN w2."conditionsJson" ELSE '[]'::jsonb END
  ) AS c(cond)
  JOIN _cp_stage_map m
    ON m.organization_id = w2."organizationId"
   AND m.stage_group NOT IN ('active')
   AND (c.cond->>'value' = m.old_key OR c.cond->>'value' = m.stage_id)
  WHERE c.cond->>'field' = 'stage'
  GROUP BY w2.id
) retired
WHERE w.id = retired.id AND w."configWarning" IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Trazabilidad: un evento por oportunidad transformada.
-- ---------------------------------------------------------------------------
INSERT INTO "timeline_events" ("id", "organizationId", "companyId", "opportunityId", "type", "title", "summary", "refType", "refId", "metadata", "occurredAt")
SELECT gen_random_uuid()::text, o."organizationId", o."companyId", o.id, 'legacy_migration',
       'Migración al nuevo proceso comercial',
       'Etapa legacy: ' || m.old_label || ' → ' || s.label || ' · estado: ' || o.status
         || COALESCE(' · revisar: ' || o."migrationReview", ''),
       'migration', '20261103120100_commercial_process_backfill',
       jsonb_build_object('legacyStageKey', m.old_key, 'stageKey', s.key, 'status', o.status, 'migrationReview', o."migrationReview"),
       NOW()
FROM "opportunities" o
JOIN _cp_stage_map m ON m.old_key = o."legacyStageKey" AND m.organization_id = o."organizationId"
JOIN "pipeline_stages" s ON s.id = o."stageId"
WHERE (m.stage_group <> 'active' OR o."migrationReview" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "timeline_events" e
    WHERE e."opportunityId" = o.id AND e.type = 'legacy_migration'
  );

-- ---------------------------------------------------------------------------
-- 7. Validaciones: abortan la migración (rollback) si algo no cierra.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad FROM "opportunities" o
  JOIN "pipeline_stages" s ON s.id = o."stageId"
  WHERE s."organizationId" <> o."organizationId";
  IF bad > 0 THEN RAISE EXCEPTION 'commercial_process_backfill: % oportunidades con etapa de otra organización', bad; END IF;

  SELECT COUNT(*) INTO bad FROM "organizations" org
  WHERE (SELECT COUNT(*) FROM "pipeline_stages" s WHERE s."organizationId" = org.id AND s."isActive" AND NOT s."isWon" AND NOT s."isLost") < 4;
  IF bad > 0 THEN RAISE EXCEPTION 'commercial_process_backfill: % organizaciones sin las 4 etapas activas', bad; END IF;

  SELECT COUNT(*) INTO bad FROM "opportunities" o
  WHERE NOT EXISTS (SELECT 1 FROM "opportunity_stage_history" h WHERE h."opportunityId" = o.id);
  IF bad > 0 THEN RAISE EXCEPTION 'commercial_process_backfill: % oportunidades sin historial de etapa', bad; END IF;

  SELECT COUNT(*) INTO bad FROM "opportunities" o
  JOIN "commercial_attributions" a ON a.id = o."firstTouchAttributionId"
  WHERE a."organizationId" <> o."organizationId";
  IF bad > 0 THEN RAISE EXCEPTION 'commercial_process_backfill: % atribuciones cruzadas entre organizaciones', bad; END IF;
END $$;
