-- Datos legacy representativos para probar la migración del rediseño
-- comercial (HU-CRM-02, escenario H). SOLO para bases locales/efímeras:
-- scripts/test-commercial-migration.ts los carga sobre el esquema previo a
-- 20261103120000_commercial_process_structure y valida el resultado.

INSERT INTO organizations (id, name, slug, "updatedAt") VALUES
  ('org_a', 'Org A', 'org-a', NOW()),
  ('org_b', 'Org B', 'org-b', NOW());

INSERT INTO users (id, "organizationId", email, "passwordHash", name, role, "updatedAt") VALUES
  ('user_a', 'org_a', 'a@example.test', 'x', 'Usuaria A', 'ADMIN', NOW()),
  ('user_b', 'org_b', 'b@example.test', 'x', 'Usuario B', 'ADMIN', NOW());

-- Org A: pipeline histórico completo + congelado. Org B: pipeline mínimo
-- personalizado (sin calificada ni propuesta_principal, con etapa propia).
INSERT INTO pipeline_stages (id, "organizationId", key, label, "sortOrder", "isWon", "isLost", "updatedAt") VALUES
  ('a_lead', 'org_a', 'lead_identificado', 'Lead identificado', 0, false, false, NOW()),
  ('a_inv', 'org_a', 'investigacion_realizada', 'Investigación realizada', 1, false, false, NOW()),
  ('a_contact', 'org_a', 'primer_contacto', 'Primer contacto', 2, false, false, NOW()),
  ('a_disc', 'org_a', 'reunion_discovery', 'Reunión discovery', 3, false, false, NOW()),
  ('a_pain', 'org_a', 'dolor_validado', 'Dolor validado', 4, false, false, NOW()),
  ('a_s0o', 'org_a', 'sprint_0_ofrecido', 'Sprint 0 ofrecido', 5, false, false, NOW()),
  ('a_s0a', 'org_a', 'sprint_0_aceptado', 'Sprint 0 aceptado', 6, false, false, NOW()),
  ('a_diag', 'org_a', 'diagnostico_realizado', 'Diagnóstico realizado', 7, false, false, NOW()),
  ('a_prop', 'org_a', 'propuesta_principal', 'Propuesta principal', 8, false, false, NOW()),
  ('a_neg', 'org_a', 'negociacion', 'Negociación', 9, false, false, NOW()),
  ('a_won', 'org_a', 'ganado', 'Ganado', 10, true, false, NOW()),
  ('a_lost', 'org_a', 'perdido', 'Perdido', 11, false, true, NOW()),
  ('a_frozen', 'org_a', 'congelado', 'Congelado', 12, false, false, NOW()),
  ('b_disc', 'org_b', 'reunion_discovery', 'Discovery', 0, false, false, NOW()),
  ('b_pilot', 'org_b', 'piloto', 'Piloto', 1, false, false, NOW()),
  ('b_neg', 'org_b', 'negociacion', 'Negociación', 2, false, false, NOW()),
  ('b_won', 'org_b', 'ganado', 'Ganado', 3, true, false, NOW());

INSERT INTO companies (id, "organizationId", name, source, "updatedAt") VALUES
  ('co_a1', 'org_a', 'Acme', 'Referido por Juan', NOW()),
  ('co_a2', 'org_a', 'Globex', 'LinkedIn', NOW()),
  ('co_b1', 'org_b', 'Initech', NULL, NOW());

INSERT INTO people (id, "organizationId", "companyId", "firstName", "lastName", email, "updatedAt") VALUES
  ('pe_a1', 'org_a', 'co_a1', 'Ana', 'Pérez', 'ana@acme.test', NOW()),
  ('pe_a2', 'org_a', 'co_a2', 'Bruno', 'Díaz', NULL, NOW());

INSERT INTO opportunities (id, "organizationId", "companyId", name, "stageId", status, source, "estimatedValue", "mainPain", "ownerId", "createdById", "lossReason", "createdAt", "updatedAt") VALUES
  ('op_lead', 'org_a', 'co_a1', 'Acme prospecto', 'a_lead', 'open', 'Referido por Juan', NULL, NULL, 'user_a', 'user_a', NULL, '2026-08-01', NOW()),
  ('op_lead_project', 'org_a', 'co_a2', 'Globex proyecto real', 'a_contact', 'open', 'LinkedIn', 5000000, 'Procesos manuales', 'user_a', 'user_a', NULL, '2026-08-02', NOW()),
  ('op_disc', 'org_a', 'co_a1', 'Acme discovery', 'a_disc', 'open', 'web', NULL, NULL, 'user_a', 'user_a', NULL, '2026-08-03', NOW()),
  ('op_s0', 'org_a', 'co_a1', 'Acme sprint 0', 'a_s0a', 'open', NULL, NULL, NULL, NULL, 'user_a', NULL, '2026-08-04', NOW()),
  ('op_prop_sent', 'org_a', 'co_a1', 'Acme propuesta enviada', 'a_prop', 'open', NULL, 1000, NULL, 'user_a', 'user_a', NULL, '2026-08-05', NOW()),
  ('op_prop_unverified', 'org_a', 'co_a2', 'Globex propuesta sin evidencia', 'a_prop', 'open', NULL, 2000, NULL, 'user_a', 'user_a', NULL, '2026-08-06', NOW()),
  ('op_won_open', 'org_a', 'co_a1', 'Acme ganado inconsistente', 'a_won', 'open', NULL, 3000, NULL, 'user_a', 'user_a', NULL, '2026-08-07', NOW()),
  ('op_lost', 'org_a', 'co_a2', 'Globex perdido', 'a_lost', 'lost', NULL, NULL, NULL, 'user_a', 'user_a', 'PRICE', '2026-08-08', NOW()),
  ('op_lost_open', 'org_a', 'co_a2', 'Globex perdido sin motivo', 'a_lost', 'open', NULL, NULL, NULL, 'user_a', 'user_a', NULL, '2026-08-09', NOW()),
  ('op_frozen_known', 'org_a', 'co_a1', 'Acme congelado con evidencia', 'a_frozen', 'open', NULL, NULL, NULL, 'user_a', 'user_a', NULL, '2026-08-10', NOW()),
  ('op_frozen_unknown', 'org_a', 'co_a2', 'Globex congelado sin evidencia', 'a_frozen', 'open', NULL, NULL, NULL, 'user_a', 'user_a', NULL, '2026-08-11', NOW()),
  ('op_dup_1', 'org_a', 'co_a1', 'Acme Duplicada', 'a_neg', 'open', NULL, NULL, NULL, 'user_a', 'user_a', NULL, '2026-08-12', NOW()),
  ('op_dup_2', 'org_a', 'co_a1', 'acme duplicada ', 'a_neg', 'open', NULL, NULL, NULL, 'user_a', 'user_a', NULL, '2026-08-13', NOW()),
  ('op_b_pilot', 'org_b', 'co_b1', 'Initech piloto', 'b_pilot', 'open', NULL, NULL, NULL, 'user_b', 'user_b', NULL, '2026-08-14', NOW()),
  ('op_b_won', 'org_b', 'co_b1', 'Initech ganado', 'b_won', 'won', 'Partner Foo', 9000, NULL, 'user_b', 'user_b', NULL, '2026-08-15', NOW());

-- Evidencia de timeline: cuándo se ganó y desde qué etapa se congeló.
INSERT INTO timeline_events (id, "organizationId", "companyId", "opportunityId", type, title, summary, "occurredAt") VALUES
  ('ev_won', 'org_a', 'co_a1', 'op_won_open', 'stage_changed', 'Cambio de etapa', 'Negociación → Ganado', '2026-09-01T10:00:00Z'),
  ('ev_frozen', 'org_a', 'co_a1', 'op_frozen_known', 'stage_changed', 'Cambio de etapa', 'Propuesta principal → Congelado', '2026-09-02T10:00:00Z'),
  ('ev_neg', 'org_a', 'co_a1', 'op_dup_1', 'stage_changed', 'Cambio de etapa', 'Propuesta principal → Negociación', '2026-09-03T10:00:00Z');

INSERT INTO commercial_offers (id, "organizationId", "opportunityId", "versionNumber", status, "offerorName", "sentAt", "updatedAt") VALUES
  ('of_sent', 'org_a', 'op_prop_sent', 1, 'sent', 'Zalantos', '2026-09-05T12:00:00Z', NOW()),
  ('of_draft', 'org_a', 'op_prop_unverified', 1, 'draft', 'Zalantos', NULL, NOW());

INSERT INTO activities (id, "organizationId", "companyId", "opportunityId", type, title, status, "updatedAt") VALUES
  ('ac_1', 'org_a', 'co_a1', 'op_lead', 'call', 'Llamar a Ana', 'todo', NOW()),
  ('ac_2', 'org_a', 'co_a1', 'op_frozen_known', 'email', 'Email enviado', 'done', NOW());

INSERT INTO notes (id, "organizationId", "companyId", "opportunityId", body, "updatedAt") VALUES
  ('no_1', 'org_a', 'co_a1', 'op_lead', 'Contexto del prospecto', NOW());

INSERT INTO commercial_partners (id, "organizationId", "displayName", kind, "updatedAt") VALUES
  ('cp_a1', 'org_a', 'Partner Uno', 'external', NOW());

INSERT INTO opportunity_commercial_partners (id, "organizationId", "opportunityId", "commercialPartnerId", role, "profitSharePercentage", "updatedAt") VALUES
  ('ocp_1', 'org_a', 'op_won_open', 'cp_a1', 'referrer', 10, NOW());

INSERT INTO inbound_leads (id, "organizationId", source, "externalId", "firstName", email, status, "updatedAt") VALUES
  ('il_1', 'org_a', 'website_contact', 'ext-1', 'Carla', 'carla@x.test', 'new', NOW());

INSERT INTO workflows (id, "organizationId", name, "triggerEntity", "triggerEvent", "conditionsJson", "actionsJson", "updatedAt") VALUES
  ('wf_retired', 'org_a', 'Al ofrecer Sprint 0', 'opportunity', 'stage_changed', '[{"field":"stage","op":"changed_to","value":"sprint_0_ofrecido"}]', '[{"type":"create_activity","title":"Preparar Sprint 0","activityType":"task"}]', NOW()),
  ('wf_active', 'org_a', 'Al negociar', 'opportunity', 'stage_changed', '[{"field":"stage","op":"changed_to","value":"a_neg"}]', '[{"type":"create_activity","title":"Revisar contrato","activityType":"task"}]', NOW()),
  ('wf_won', 'org_a', 'Al ganar', 'opportunity', 'stage_changed', '[{"field":"stage","op":"changed_to","value":"ganado"}]', '[{"type":"create_activity","title":"Kickoff","activityType":"task"}]', NOW()),
  ('wf_frozen', 'org_a', 'Al congelar', 'opportunity', 'stage_changed', '[{"field":"stage","op":"eq","value":"a_frozen"}]', '[{"type":"create_activity","title":"Agendar reactivación","activityType":"task"}]', NOW()),
  ('wf_mixed', 'org_a', 'Ganado urgente', 'opportunity', 'stage_changed', '[{"field":"stage","op":"changed_to","value":"a_won"},{"field":"urgency","op":"eq","value":"high"}]', '[{"type":"create_activity","title":"Avisar","activityType":"task"}]', NOW());
