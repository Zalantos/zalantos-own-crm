-- Setup de roles de Postgres para RLS multi-tenant. Correr una vez por
-- entorno (dev/staging/prod) como el rol dueño de las tablas (ej. postgres),
-- ANTES de aplicar la migración que habilita RLS. No es una migración de
-- Prisma porque el nombre/password del rol varía por entorno.
--
-- Uso: psql "$DATABASE_URL" -v crm_app_password='<password-generado>' -f scripts/sql/setup-roles.sql
--
-- psql NO interpola variables dentro de literales dollar-quoted ($$...$$),
-- así que la password entra al bloque DO vía set_config/current_setting en
-- vez de :'crm_app_password' directo (eso daría "syntax error at or near :").
-- \o /dev/null evita que el SELECT eche la password a stdout/logs.
\o /dev/null
SELECT set_config('setup.crm_app_password', :'crm_app_password', false);
\o

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    EXECUTE format(
      'CREATE ROLE crm_app LOGIN PASSWORD %L NOBYPASSRLS',
      current_setting('setup.crm_app_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE crm_app PASSWORD %L',
      current_setting('setup.crm_app_password')
    );
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO crm_app;

-- Acceso DML (sin DDL: crm_app no puede crear/alterar tablas). Las
-- migraciones siguen corriendo con el rol dueño (DATABASE_URL).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;

-- El código de tenant nunca debe leer/escribir organizations directamente
-- (forOrg() lo prohíbe en runtime); no le damos grants a ese nivel tampoco,
-- así una fila ajena es invisible incluso si un bug futuro lo intentara.
REVOKE ALL ON organizations FROM crm_app;

-- El historial de migraciones tampoco es asunto del tráfico de tenant.
REVOKE ALL ON "_prisma_migrations" FROM crm_app;
