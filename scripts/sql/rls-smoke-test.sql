-- Smoke test de RLS: correr como el rol crm_app (NO como el owner, que
-- bypassea RLS y haría pasar el test sin probar nada). Requiere que ya
-- exista al menos una organización con datos (ej. Zalantos tras el seed).
--
-- Uso: psql "postgresql://crm_app:<password>@host:port/db" -f scripts/sql/rls-smoke-test.sql

\echo '--- Sin app.current_org_id seteado: debe devolver 0 filas (deny-by-default) ---'
SELECT count(*) AS companies_sin_contexto FROM companies;

\echo '--- Con app.current_org_id = org_zalantos: debe devolver solo sus filas ---'
BEGIN;
SELECT set_config('app.current_org_id', 'org_zalantos', true);
SELECT count(*) AS companies_zalantos FROM companies;
SELECT count(*) AS opportunities_zalantos FROM opportunities;
COMMIT;

\echo '--- Con un org_id inexistente: debe devolver 0 filas ---'
BEGIN;
SELECT set_config('app.current_org_id', 'org-que-no-existe', true);
SELECT count(*) AS companies_org_falsa FROM companies;
COMMIT;

\echo '--- Intento de INSERT con organizationId de otra org: debe fallar (WITH CHECK) ---'
BEGIN;
SELECT set_config('app.current_org_id', 'org_zalantos', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO companies (id, "organizationId", name, "updatedAt")
    VALUES ('rls-test-row', 'otra-org-cualquiera', 'RLS test', now());
    RAISE EXCEPTION 'FALLO: el INSERT con organizationId ajeno no debió pasar la política';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'OK: la política bloqueó el INSERT cross-tenant';
  END;
END $$;
ROLLBACK;

\echo '--- Fin smoke test ---'
