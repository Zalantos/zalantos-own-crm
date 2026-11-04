-- Backfill de actores, reglas por defecto, reuniones y partners. Todo es
-- aditivo e idempotente (ON CONFLICT / NOT EXISTS): no borra ni modifica
-- meetings, evidence, oportunidades, ofertas ni comisiones.
-- Ids con el prefijo "mig" + md5 determinístico: re-ejecutar no duplica.

-- 1. Partners ya asignados a una oportunidad pasan a ser actores. La comisión
--    sigue en opportunity_commercial_partners y en las ofertas.
INSERT INTO "commercial_actor_links"
  ("id", "organizationId", "opportunityId", "commercialPartnerId", "actorKey", "role", "description", "linkedAt", "source", "updatedAt")
SELECT
  'mig' || md5('ocp:' || ocp."id"),
  ocp."organizationId", ocp."opportunityId", ocp."commercialPartnerId",
  'partner:' || ocp."commercialPartnerId",
  'commercial_partner', ocp."notes", ocp."createdAt", 'migration', CURRENT_TIMESTAMP
FROM "opportunity_commercial_partners" ocp
ON CONFLICT DO NOTHING;

-- 2. Referidores del primer toque (persona o partner) en leads y oportunidades.
INSERT INTO "commercial_actor_links"
  ("id", "organizationId", "commercialLeadId", "commercialPartnerId", "actorKey", "role", "linkedAt", "source", "updatedAt")
SELECT
  'mig' || md5('lead-partner:' || l."id" || ':' || a."referrerPartnerId"),
  l."organizationId", l."id", a."referrerPartnerId",
  'partner:' || a."referrerPartnerId",
  'referrer', COALESCE(a."touchedAt", a."createdAt"), 'migration', CURRENT_TIMESTAMP
FROM "commercial_leads" l
JOIN "commercial_attributions" a ON a."id" = l."firstTouchAttributionId"
WHERE a."referrerPartnerId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "commercial_actor_links"
  ("id", "organizationId", "commercialLeadId", "personId", "actorKey", "role", "linkedAt", "source", "updatedAt")
SELECT
  'mig' || md5('lead-person:' || l."id" || ':' || a."referrerPersonId"),
  l."organizationId", l."id", a."referrerPersonId",
  'person:' || a."referrerPersonId",
  'referrer', COALESCE(a."touchedAt", a."createdAt"), 'migration', CURRENT_TIMESTAMP
FROM "commercial_leads" l
JOIN "commercial_attributions" a ON a."id" = l."firstTouchAttributionId"
WHERE a."referrerPersonId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "commercial_actor_links"
  ("id", "organizationId", "opportunityId", "commercialPartnerId", "actorKey", "role", "linkedAt", "source", "updatedAt")
SELECT
  'mig' || md5('opp-partner:' || o."id" || ':' || a."referrerPartnerId"),
  o."organizationId", o."id", a."referrerPartnerId",
  'partner:' || a."referrerPartnerId",
  'referrer', COALESCE(a."touchedAt", a."createdAt"), 'migration', CURRENT_TIMESTAMP
FROM "opportunities" o
JOIN "commercial_attributions" a ON a."id" = o."firstTouchAttributionId"
WHERE a."referrerPartnerId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "commercial_actor_links"
  ("id", "organizationId", "opportunityId", "personId", "actorKey", "role", "linkedAt", "source", "updatedAt")
SELECT
  'mig' || md5('opp-person:' || o."id" || ':' || a."referrerPersonId"),
  o."organizationId", o."id", a."referrerPersonId",
  'person:' || a."referrerPersonId",
  'referrer', COALESCE(a."touchedAt", a."createdAt"), 'migration', CURRENT_TIMESTAMP
FROM "opportunities" o
JOIN "commercial_attributions" a ON a."id" = o."firstTouchAttributionId"
WHERE a."referrerPersonId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Reglas de seguimiento por defecto en cada organización. Los umbrales
--    replican los de la próxima mejor acción. Las etapas de oportunidad se
--    toman de pipeline_stages para no crear reglas de etapas inexistentes.
INSERT INTO "commercial_alert_rules"
  ("id", "organizationId", "pipeline", "stageKey", "condition", "thresholdDays", "dayType", "severity", "updatedAt")
SELECT
  'mig' || md5(org."id" || ':prospecting:' || d.stage || ':' || d.cond),
  org."id", 'prospecting', d.stage, d.cond, d.days, 'calendar', d.sev, CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN (VALUES
  ('prospect',  'stage_stale',    7,  'warning'),
  ('contacted', 'no_interaction', 7,  'warning'),
  ('lead',      'no_next_action', 0,  'warning'),
  ('lead',      'stage_stale',    14, 'warning')
) AS d(stage, cond, days, sev)
ON CONFLICT DO NOTHING;

INSERT INTO "commercial_alert_rules"
  ("id", "organizationId", "pipeline", "stageKey", "condition", "thresholdDays", "dayType", "severity", "updatedAt")
SELECT
  'mig' || md5(ps."organizationId" || ':opportunity:' || d.stage || ':' || d.cond),
  ps."organizationId", 'opportunity', d.stage, d.cond, d.days, 'calendar', d.sev, CURRENT_TIMESTAMP
FROM "pipeline_stages" ps
JOIN (VALUES
  ('reunion_discovery',   'stage_stale',    14, 'warning'),
  ('calificada',          'no_next_action', 0,  'warning'),
  ('propuesta_principal', 'no_interaction', 5,  'warning'),
  ('negociacion',         'no_interaction', 7,  'critical')
) AS d(stage, cond, days, sev) ON d.stage = ps."key"
WHERE ps."isActive" = true
ON CONFLICT DO NOTHING;

INSERT INTO "commercial_alert_rules"
  ("id", "organizationId", "pipeline", "stageKey", "condition", "thresholdDays", "dayType", "severity", "updatedAt")
SELECT
  'mig' || md5(org."id" || ':opportunity:paused:reactivation_due'),
  org."id", 'opportunity', 'paused', 'reactivation_due', 0, 'calendar', 'critical', CURRENT_TIMESTAMP
FROM "organizations" org
ON CONFLICT DO NOTHING;

-- 4. Reuniones históricas → Activity(type=meeting). La fila original de
--    meetings/evidence queda intacta (transcripción incluida); esta copia es
--    la que ven fichas, agente y reglas.
INSERT INTO "activities"
  ("id", "organizationId", "companyId", "opportunityId", "type", "title", "description", "outcomes",
   "occurredAt", "completedAt", "status", "statusChangedAt", "channel", "createdVia", "createdById",
   "externalSource", "externalId", "createdAt", "updatedAt")
SELECT
  'mig' || md5('meeting:' || m."id"),
  m."organizationId", m."companyId", m."opportunityId", 'meeting', m."title",
  NULLIF(concat_ws(E'\n\n',
    NULLIF(btrim(COALESCE(m."aiSummary"->>'headline', '')), ''),
    (SELECT 'Puntos clave:' || E'\n' || string_agg('- ' || v, E'\n')
       FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(m."aiSummary"->'keyPoints') = 'array' THEN m."aiSummary"->'keyPoints' ELSE '[]'::jsonb END
       ) AS v),
    (SELECT 'Riesgos:' || E'\n' || string_agg('- ' || v, E'\n')
       FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(m."aiSummary"->'risks') = 'array' THEN m."aiSummary"->'risks' ELSE '[]'::jsonb END
       ) AS v),
    (SELECT 'Participantes: ' || string_agg(p->>'name', ', ')
       FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(m."participants") = 'array' THEN m."participants" ELSE '[]'::jsonb END
       ) AS p
      WHERE COALESCE(p->>'name', '') <> '')
  ), ''),
  NULLIF(concat_ws(E'\n\n',
    (SELECT 'Acuerdos:' || E'\n' || string_agg('- ' || v, E'\n')
       FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(m."aiSummary"->'decisions') = 'array' THEN m."aiSummary"->'decisions' ELSE '[]'::jsonb END
       ) AS v),
    (SELECT 'Próximas acciones:' || E'\n' || string_agg('- ' || v, E'\n')
       FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(m."aiSummary"->'nextSteps') = 'array' THEN m."aiSummary"->'nextSteps' ELSE '[]'::jsonb END
       ) AS v)
  ), ''),
  m."meetingDate", m."meetingDate", 'done', m."updatedAt", m."meetingType",
  CASE WHEN m."sourceType" = 'manual' THEN 'manual' ELSE 'meeting' END,
  (SELECT u."id" FROM "users" u WHERE u."id" = m."createdBy"),
  'legacy_meeting', m."id", m."createdAt", m."updatedAt"
FROM "meetings" m
ON CONFLICT DO NOTHING;

-- Participantes que coinciden por email con una persona de la organización.
INSERT INTO "activity_people" ("id", "organizationId", "activityId", "personId")
SELECT
  'mig' || md5('meeting-person:' || a."id" || ':' || pe."id"),
  a."organizationId", a."id", pe."id"
FROM "activities" a
JOIN "meetings" m ON m."id" = a."externalId"
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(m."participants") = 'array' THEN m."participants" ELSE '[]'::jsonb END
) AS p
JOIN "people" pe
  ON pe."organizationId" = a."organizationId"
 AND lower(pe."email") = lower(p->>'email')
WHERE a."externalSource" = 'legacy_meeting'
ON CONFLICT DO NOTHING;

-- La UI muestra una persona principal: la primera que coincidió.
UPDATE "activities" a
SET "personId" = (
  SELECT ap."personId" FROM "activity_people" ap
  WHERE ap."activityId" = a."id"
  ORDER BY ap."id" LIMIT 1
)
WHERE a."externalSource" = 'legacy_meeting' AND a."personId" IS NULL;

-- 5. El pipeline de alianzas desaparece: una alianza descartada queda como
--    partner inactivo. Las columnas alliance* conservan el dato original.
UPDATE "commercial_partners"
SET "isActive" = false
WHERE "allianceStatus" = 'discarded' AND "isActive" = true;
