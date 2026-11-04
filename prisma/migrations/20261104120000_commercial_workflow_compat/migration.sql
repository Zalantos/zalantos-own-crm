-- Rediseño del proceso comercial (HU-CRM-02) — compatibilidad de workflows.
--
-- Ganado / Perdido / Congelado dejaron de ser etapas: ahora son estados de la
-- oportunidad (won / lost / paused) y se emiten como evento status_changed.
-- Un workflow "stage_changed" cuya condición es SOLO "etapa = Ganado"
-- (o Perdido / Congelado) tiene una equivalencia exacta y se reescribe a
-- "status_changed" + "estado = won/lost/paused", conservando la acción.
--
-- Todo lo demás (etapas de diagnóstico o prospección, condiciones mixtas,
-- operadores neq) NO se reescribe: sigue con la advertencia visible que dejó
-- 20261103120100_commercial_process_backfill.
--
-- Solo datos, sin cambios de schema. Idempotente: un workflow migrado ya no
-- tiene triggerEvent = stage_changed y no vuelve a seleccionarse.

-- Una sola sentencia (sin tablas temporales): no depende de que el script
-- corra dentro de una única transacción.
UPDATE "workflows" w
SET "triggerEvent" = 'status_changed',
    "conditionsJson" = jsonb_build_array(
      jsonb_build_object('field', 'status', 'op', t.op, 'value', t.status)
    ),
    "configWarning" = 'Migrado automáticamente por el rediseño comercial: la condición "etapa = '
      || t.labels || '" ahora es "estado = ' || t.status
      || '" (evento status_changed). La acción no cambió; verificá que siga teniendo sentido.',
    "updatedAt" = NOW()
FROM (
  SELECT
    w2.id,
    MIN(c.cond->>'op') AS op,
    MIN(st.status) AS status,
    string_agg(DISTINCT st.label, ', ') AS labels
  FROM "workflows" w2
  CROSS JOIN LATERAL jsonb_array_elements(w2."conditionsJson") AS c(cond)
  LEFT JOIN LATERAL (
    SELECT
      s.label,
      CASE
        WHEN s."isWon" OR s.key = 'ganado' THEN 'won'
        WHEN s."isLost" OR s.key = 'perdido' THEN 'lost'
        WHEN s.key = 'congelado' OR s.label ILIKE 'congelad%' THEN 'paused'
        ELSE NULL
      END AS status
    FROM "pipeline_stages" s
    WHERE s."organizationId" = w2."organizationId"
      AND (s.key = c.cond->>'value' OR s.id = c.cond->>'value')
      AND s.key NOT IN ('reunion_discovery', 'calificada', 'propuesta_principal', 'negociacion')
    ORDER BY s.id
    LIMIT 1
  ) st ON true
  WHERE w2."triggerEntity" = 'opportunity'
    AND w2."triggerEvent" = 'stage_changed'
    AND jsonb_typeof(w2."conditionsJson") = 'array'
  GROUP BY w2.id
  HAVING bool_and(
           c.cond->>'field' = 'stage'
           AND c.cond->>'op' IN ('eq', 'changed_to')
           AND st.status IS NOT NULL
         )
     AND COUNT(DISTINCT st.status) = 1
     AND COUNT(DISTINCT c.cond->>'op') = 1
) t
WHERE w.id = t.id;
