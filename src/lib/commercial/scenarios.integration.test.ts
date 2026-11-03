import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";

// Escenarios de aceptación A–G del rediseño comercial (HU-CRM-02) contra
// Postgres real con RLS activo. Requiere una base LOCAL con las migraciones
// aplicadas y el rol crm_app (scripts/sql/setup-roles.sql):
//   INTEGRATION_DATABASE_URL=postgresql://localhost/crm_redesign \
//   INTEGRATION_TENANT_DATABASE_URL=postgresql://crm_app:...@localhost/crm_redesign \
//   npm run test:commercial-integration
// El escenario H (migración legacy) vive en scripts/test-commercial-migration.ts.

const ownerUrl = process.env.INTEGRATION_DATABASE_URL;
const tenantUrl = process.env.INTEGRATION_TENANT_DATABASE_URL ?? ownerUrl;
for (const url of [ownerUrl, tenantUrl]) {
  if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Las pruebas de integración solo corren contra una base local.");
  }
}
const skip = !ownerUrl ? "Define INTEGRATION_DATABASE_URL (base local) para correr la integración" : false;

if (ownerUrl) {
  // Antes de importar Prisma: los clientes leen el entorno al cargarse.
  process.env.DATABASE_URL = ownerUrl;
  process.env.DATABASE_URL_SYSTEM = ownerUrl;
  process.env.TENANT_DATABASE_URL = tenantUrl;
  process.env.CRON_SECRET = "integration-cron-secret-0000";
  process.env.RUMBO_CALLBACK_SECRET = "integration-rumbo-secret-000";
  process.env.INTEGRATION_GATEWAY_SECRET = "integration-gateway-secret";
  process.env.AGENT_MODEL = "openai/test-model";
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

async function loadModules() {
  const [prisma, tenant, stages, leads, opportunityService, partners, rumbo, funnel, links, ingest, convert, executor, apply, cron, rumboRoute] =
    await Promise.all([
      import("@/lib/prisma"),
      import("@/lib/tenant"),
      import("@/lib/pipeline/stages"),
      import("@/lib/commercial/leads"),
      import("@/lib/commercial/opportunity-service"),
      import("@/lib/commercial/partner-service"),
      import("@/lib/commercial/rumbo"),
      import("@/lib/commercial/funnel"),
      import("@/lib/commercial/links"),
      import("@/lib/inbound-leads/ingest"),
      import("@/lib/inbound-leads/convert"),
      import("@/lib/agent/executor"),
      import("@/lib/meeting-intelligence/apply"),
      import("@/app/api/cron/commercial-follow-ups/route"),
      import("@/app/api/integrations/rumbo/handoff-status/route"),
    ]);
  return { prisma, tenant, stages, leads, opportunityService, partners, rumbo, funnel, links, ingest, convert, executor, apply, cron, rumboRoute };
}

const suffix = Date.now().toString(36);
let m: Modules;
let gateway: Server;
let gatewayCalls = 0;

type Org = { id: string; userId: string };
let orgA: Org;
let orgB: Org;

async function createOrg(label: string): Promise<Org> {
  const { prismaSystem } = m.prisma;
  const org = await prismaSystem.organization.create({
    data: { name: `Org ${label}`, slug: `it-${label}-${suffix}` },
  });
  const user = await prismaSystem.user.create({
    data: { organizationId: org.id, email: `${label}-${suffix}@it.test`, passwordHash: "x", name: `User ${label}`, role: "ADMIN" },
  });
  await prismaSystem.teamMember.create({ data: { organizationId: org.id, name: `User ${label}`, userId: user.id } });
  await prismaSystem.pipelineStage.createMany({
    data: m.stages.DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage, organizationId: org.id })),
  });
  return { id: org.id, userId: user.id };
}

function ctxFor(org: Org, source = "manual") {
  return { db: m.tenant.forOrg(org.id), organizationId: org.id, actorId: org.userId, source };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function stageId(org: Org, key: string) {
  const stage = await m.prisma.prismaSystem.pipelineStage.findFirstOrThrow({ where: { organizationId: org.id, key } });
  return stage;
}

before(async () => {
  if (skip) return;
  m = await loadModules();
  gateway = createServer((request, response) => {
    gatewayCalls += 1;
    request.resume();
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const address = gateway.address();
  process.env.INTEGRATION_GATEWAY_URL = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  orgA = await createOrg("a");
  orgB = await createOrg("b");
});

after(async () => {
  if (skip) return;
  gateway?.close();
  await m.prisma.prismaSystem.$disconnect();
  await m.prisma.prismaTenantBase.$disconnect();
});

describe("Escenario A — prospección outbound", { skip }, () => {
  it("prospecto → contactado → lead → oportunidad sin duplicar personas ni perder origen", async () => {
    const ctx = ctxFor(orgA);
    const created = unwrap(
      await m.leads.createCommercialLead(ctx, {
        companyName: "Outbound SpA",
        person: { firstName: "Paula", lastName: "Soto", email: "paula@outbound.test" },
        attribution: { sourceChannel: "linkedin_organic", sourceDetail: "Post sobre automatización" },
      }),
    );
    const duplicate = await m.leads.createCommercialLead(ctx, {
      companyName: "Outbound SpA",
      person: { firstName: "Paula", lastName: "Soto", email: "PAULA@outbound.test" },
    });
    assert.equal(duplicate.ok, false, "no se crea un segundo lead activo para la misma persona");

    const lead = await ctx.db.commercialLead.findUniqueOrThrow({ where: { id: created.id } });
    await ctx.db.activity.create({
      data: { organizationId: orgA.id, commercialLeadId: lead.id, companyId: lead.companyId, type: "email", title: "Contactar por email", status: "todo" },
    });
    assert.equal((await m.leads.changeLeadStatus(ctx, lead.id, { status: "contacted" })).ok, false, "contactado exige intento registrado");
    unwrap(
      await m.leads.changeLeadStatus(ctx, lead.id, {
        status: "contacted",
        contactAttempt: { type: "email", occurredAt: new Date(), summary: "Email de presentación" },
      }),
    );
    unwrap(await m.leads.changeLeadStatus(ctx, lead.id, { status: "lead", interestSignal: "Respondió: quiere automatizar cobranza" }));
    const { opportunityId } = unwrap(
      await m.leads.convertLeadToOpportunity(ctx, lead.id, { name: "Outbound · Cobranza", mainPain: "Cobranza manual" }),
    );

    const opportunity = await ctx.db.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, include: { stage: true } });
    const finalLead = await ctx.db.commercialLead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(opportunity.stage.key, "reunion_discovery");
    assert.equal(opportunity.commercialLeadId, lead.id);
    assert.equal(opportunity.firstTouchAttributionId, lead.firstTouchAttributionId);
    assert.equal(opportunity.decisionMakerId, lead.personId);
    assert.equal(finalLead.status, "converted");
    assert.ok(finalLead.firstContactAt && finalLead.becameLeadAt && finalLead.convertedAt);
    assert.equal(await ctx.db.person.count({ where: { email: "paula@outbound.test" } }), 1);
    assert.equal(await ctx.db.company.count({ where: { name: "Outbound SpA" } }), 1);
    assert.equal(await ctx.db.activity.count({ where: { commercialLeadId: lead.id } }), 2);
    const history = await ctx.db.commercialStatusChange.findMany({ where: { entityId: lead.id }, orderBy: { changedAt: "asc" } });
    assert.deepEqual(history.map((row) => row.toValue), ["prospect", "contacted", "lead", "converted"]);
    const attribution = await ctx.db.commercialAttribution.findUniqueOrThrow({ where: { id: opportunity.firstTouchAttributionId! } });
    assert.equal(attribution.sourceChannel, "linkedin_organic");
  });
});

describe("Escenario B — lead inbound de campaña hasta ganado", { skip }, () => {
  it("la campaña se relaciona con el negocio ganado y los reintentos no duplican", async () => {
    const ctx = ctxFor(orgA);
    const payload = {
      source: "website_contact",
      external_id: `form-${suffix}`,
      first_name: "Rodrigo",
      last_name: "Paz",
      email: "rodrigo@inbound.test",
      company: "Inbound Ltda",
      message: "Necesitamos un CRM",
      utm_source: "linkedin",
      utm_medium: "paid",
      utm_campaign: `Campaña Q4 ${suffix}`,
    };
    const first = await m.ingest.ingestInboundLead(ctx.db, orgA.id, payload);
    const retry = await m.ingest.ingestInboundLead(ctx.db, orgA.id, payload);
    assert.equal(retry.created, false);
    assert.equal(retry.inboundLeadId, first.inboundLeadId);
    assert.equal(await ctx.db.commercialAttribution.count({ where: { inboundLeads: { some: { id: first.inboundLeadId } } } }), 1);

    const inbound = await ctx.db.inboundLead.findUniqueOrThrow({ where: { id: first.inboundLeadId } });
    const result = await m.tenant.withOrgTransaction(orgA.id, (tx) =>
      m.convert.convertLeadTx(tx, { organizationId: orgA.id, actorId: orgA.userId }, inbound, {
        companyName: "Inbound Ltda",
        opportunityName: "Inbound · CRM",
      }),
    );
    const opportunityId = result.opportunityId!;
    await ctx.db.opportunity.update({ where: { id: opportunityId }, data: { mainPain: "Sin CRM" } });
    unwrap(await m.opportunityService.changeOpportunityStage(ctx, { opportunityId, stage: "calificada" }));
    const blocked = await m.opportunityService.changeOpportunityStage(ctx, { opportunityId, stage: "propuesta_principal" });
    assert.equal(blocked.ok, false, "no avanza sin envío real");
    unwrap(await m.opportunityService.recordProposalSent(ctx, { opportunityId, sentAt: new Date(Date.now() - 60_000) }));
    unwrap(await m.opportunityService.changeOpportunityStage(ctx, { opportunityId, stage: "propuesta_enviada" }));
    await ctx.db.activity.create({
      data: { organizationId: orgA.id, opportunityId, companyId: result.companyId, type: "call", title: "Negociar precio", status: "done", occurredAt: new Date() },
    });
    unwrap(await m.opportunityService.changeOpportunityStage(ctx, { opportunityId, stage: "negociacion" }));
    assert.equal((await m.opportunityService.changeOpportunityStatus(ctx, opportunityId, { status: "won" })).ok, false);
    unwrap(await m.opportunityService.changeOpportunityStatus(ctx, opportunityId, { status: "won", wonEvidence: "Contrato firmado 2026-11-03" }));

    const report = await m.funnel.loadFunnel(ctx.db, { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000) });
    const campaign = await ctx.db.campaign.findFirstOrThrow({ where: { key: { startsWith: "campana-q4" } } });
    const row = report.byCampaign.find((entry) => entry.key === campaign.id);
    assert.equal(row?.won, 1);
    const history = await ctx.db.opportunityStageHistory.findMany({ where: { opportunityId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(history.map((period) => period.stageKey), ["reunion_discovery", "calificada", "propuesta_principal", "negociacion"]);
    assert.ok(history.every((period) => period.exitedAt), "al ganar se cierra el período activo");
  });
});

describe("Escenario C — oportunidad pausada", { skip }, () => {
  it("conserva su etapa, sale del tablero y genera una alerta idempotente al reactivarse", async () => {
    const ctx = ctxFor(orgA);
    const company = await ctx.db.company.create({ data: { organizationId: orgA.id, name: `Pausa ${suffix}` } });
    const stage = await stageId(orgA, "propuesta_principal");
    const opportunity = await ctx.db.opportunity.create({
      data: { organizationId: orgA.id, companyId: company.id, name: "Pausa · Propuesta", stageId: stage.id, ownerId: orgA.userId, proposalSentAt: new Date() },
    });
    unwrap(
      await m.opportunityService.changeOpportunityStatus(ctx, opportunity.id, {
        status: "paused",
        reason: "Sin presupuesto",
        reactivateAt: new Date(Date.now() - 60_000),
      }),
    );
    const paused = await ctx.db.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    assert.equal(paused.status, "paused");
    assert.equal(paused.stageId, stage.id);
    const board = await ctx.db.opportunity.count({ where: { status: "open", id: opportunity.id } });
    assert.equal(board, 0);

    const { NextRequest } = await import("next/server");
    const request = () =>
      new NextRequest("http://localhost/api/cron/commercial-follow-ups", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
    await m.cron.POST(request());
    await m.cron.POST(request());
    const alerts = await ctx.db.activity.findMany({ where: { opportunityId: opportunity.id, type: "follow_up" } });
    assert.equal(alerts.length, 1, "una sola alerta aunque el cron corra dos veces");
    assert.equal((await ctx.db.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status, "paused", "el cron no cambia el estado");
  });
});

describe("Escenario D — partner", { skip }, () => {
  it("la alianza avanza, refiere un prospecto y el negocio ganado conserva su reparto", async () => {
    const ctx = ctxFor(orgA);
    const partner = await ctx.db.commercialPartner.create({
      data: { organizationId: orgA.id, displayName: `Partner ${suffix}`, kind: "external", allianceStage: "identified", ownerId: orgA.userId },
    });
    unwrap(await m.partners.changeAlliance(ctx, partner.id, { stage: "exploration" }));
    assert.equal((await m.partners.changeAlliance(ctx, partner.id, { stage: "agreement" })).ok, false);
    unwrap(await m.partners.changeAlliance(ctx, partner.id, { stage: "agreement", agreementTerms: "10% del margen por negocio" }));
    unwrap(await m.partners.changeAlliance(ctx, partner.id, { stage: "active" }));

    const lead = unwrap(
      await m.leads.createCommercialLead(ctx, {
        companyName: `Referida ${suffix}`,
        status: "lead",
        interestSignal: "Partner presentó necesidad",
        attribution: { referrerPartnerId: partner.id },
      }),
    );
    const { opportunityId } = unwrap(await m.leads.convertLeadToOpportunity(ctx, lead.id, { name: "Referida · Proyecto" }));
    await ctx.db.opportunityCommercialPartner.create({
      data: { organizationId: orgA.id, opportunityId, commercialPartnerId: partner.id, role: "referrer", profitSharePercentage: 10 },
    });
    unwrap(await m.opportunityService.changeOpportunityStatus(ctx, opportunityId, { status: "won", wonEvidence: "OC 991" }));

    const attribution = await ctx.db.commercialAttribution.findFirstOrThrow({ where: { opportunitiesFirstTouch: { some: { id: opportunityId } } } });
    assert.equal(attribution.sourceChannel, "partner");
    assert.equal(attribution.referrerPartnerId, partner.id);
    const share = await ctx.db.opportunityCommercialPartner.findFirstOrThrow({ where: { opportunityId } });
    assert.equal(share.profitSharePercentage?.toString(), "10");
    const stages = await ctx.db.commercialStatusChange.findMany({
      where: { entityId: partner.id, field: "alliance_stage" },
      orderBy: { changedAt: "asc" },
    });
    assert.deepEqual(stages.map((row) => row.toValue), ["exploration", "agreement", "active"]);
  });
});

describe("Escenario E — agente IA", { skip }, () => {
  it("crea prospecto, registra llamada, crea oportunidad, consulta acción y respeta compuertas, todo trazable y reversible", async () => {
    const db = m.tenant.forOrg(orgA.id);
    const tools = m.executor.buildAgentToolDefinitions({
      organizationId: orgA.id,
      db,
      userId: orgA.userId,
      threadId: `thread-${suffix}`,
      channel: "web",
      pageContext: null,
      turnState: { changeCount: 0, pendingInstant: null, proposalId: null },
    });
    const prospect = (await tools.create_prospect.execute({
      companyName: `Agente ${suffix}`,
      person: { firstName: "Iván", lastName: "Lagos", email: `ivan-${suffix}@agente.test` },
      status: "lead",
      interestSignal: "Pidió una demo",
      sourceChannel: "event",
      reason: "El usuario lo pidió",
      confidence: 0.9,
    })) as { status: string; appliedItems: unknown[] };
    assert.equal(prospect.status, "applied");
    const lead = await db.commercialLead.findFirstOrThrow({ where: { title: { contains: `Agente ${suffix}` } } });
    const call = (await tools.log_interaction.execute({
      commercialLeadId: lead.id,
      type: "call",
      title: "Llamada de calificación",
      date: new Date().toISOString(),
    })) as { status: string };
    assert.equal(call.status, "applied");
    await tools.convert_lead_to_opportunity.execute({ leadId: lead.id, name: "Agente · Demo", reason: "Proyecto concreto", confidence: 0.8 });
    const opportunity = await db.opportunity.findFirstOrThrow({ where: { commercialLeadId: lead.id } });
    const suggestions = (await tools.suggest_next_actions.execute({ entity: "opportunity", id: opportunity.id })) as { suggestions: { code: string }[] };
    assert.ok(suggestions.suggestions.some((suggestion) => suggestion.code === "missing_next_action"));
    const gated = (await tools.change_stage.execute({ opportunityId: opportunity.id, stage: "calificada", reason: "x", confidence: 0.9 })) as { failedItems: { failureMessage: string | null }[] };
    assert.equal(gated.failedItems.length, 1, "la compuerta bloquea el avance sin Pain");
    const legacy = (await tools.change_stage.execute({ opportunityId: opportunity.id, stage: "ganado", reason: "x", confidence: 0.9 })) as { error?: string };
    assert.match(legacy.error ?? "", /set_opportunity_status/);
    const statusField = (await tools.update_record_fields.execute({
      entity: "opportunity",
      entityId: opportunity.id,
      updates: [{ field: "status", value: "won" }],
      reason: "x",
      confidence: 1,
    })) as { error?: string };
    assert.match(statusField.error ?? "", /set_opportunity_status/);

    const items = await db.cRMChangeItem.findMany({ where: { proposal: { chatThreadId: `thread-${suffix}` } }, orderBy: { sequence: "asc" } });
    assert.deepEqual(items.map((item) => item.type), ["add_commercial_lead", "log_activity", "convert_lead", "stage_change"]);
    const convertItem = items.find((item) => item.type === "convert_lead")!;
    await m.apply.revertItem(db, orgA.id, convertItem.id, orgA.userId);
    assert.equal(await db.opportunity.count({ where: { id: opportunity.id } }), 0, "deshacer elimina la oportunidad creada");
    assert.equal((await db.commercialLead.findUniqueOrThrow({ where: { id: lead.id } })).status, "lead", "y restaura el lead");
  });
});

describe("Escenario F — ganado y Rumbo", { skip }, () => {
  it("registra el traspaso, no afirma éxito sin confirmación y no duplica", async () => {
    const ctx = ctxFor(orgA);
    const company = await ctx.db.company.create({ data: { organizationId: orgA.id, name: `Rumbo ${suffix}` } });
    const stage = await stageId(orgA, "negociacion");
    const opportunity = await ctx.db.opportunity.create({
      data: { organizationId: orgA.id, companyId: company.id, name: "Rumbo · Proyecto", stageId: stage.id, ownerId: orgA.userId },
    });
    const org = await m.prisma.prismaSystem.organization.findUniqueOrThrow({ where: { id: orgA.id } });
    const notWon = await m.rumbo.requestRumboHandoff(ctx.db, org, orgA.userId, { opportunityId: opportunity.id, projectName: "X", startDate: null, scopeSummary: null, responsibleUserId: null });
    assert.equal(notWon.ok, false);
    unwrap(await m.opportunityService.changeOpportunityStatus(ctx, opportunity.id, { status: "won", wonEvidence: "Contrato" }));
    const callsBefore = gatewayCalls;
    const sent = unwrap(
      await m.rumbo.requestRumboHandoff(ctx.db, org, orgA.userId, { opportunityId: opportunity.id, projectName: "Rumbo · Proyecto", startDate: null, scopeSummary: "Alcance", responsibleUserId: orgA.userId }),
    );
    assert.equal(sent.status, "sent");
    assert.equal(gatewayCalls, callsBefore + 1);
    const handoff = await ctx.db.rumboHandoff.findUniqueOrThrow({ where: { opportunityId: opportunity.id } });
    assert.equal(handoff.status, "sent", "enviado ≠ confirmado");
    assert.equal(handoff.confirmedAt, null);

    const { NextRequest } = await import("next/server");
    const callback = (secret = process.env.RUMBO_CALLBACK_SECRET) =>
      new NextRequest("http://localhost/api/integrations/rumbo/handoff-status", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ handoff_id: handoff.id, status: "confirmed", rumbo_project_id: "R-1" }),
      });
    assert.equal((await m.rumboRoute.POST(callback())).status, 200);
    assert.equal((await m.rumboRoute.POST(callback("secreto-invalido-000000"))).status, 401);
    // Sin variable dedicada: el secreto del gateway ya configurado también sirve.
    const again = await (await m.rumboRoute.POST(callback(process.env.INTEGRATION_GATEWAY_SECRET))).json();
    assert.equal(again.unchanged, true);
    const confirmed = await ctx.db.rumboHandoff.findUniqueOrThrow({ where: { opportunityId: opportunity.id } });
    assert.equal(confirmed.status, "confirmed");
    const resend = await m.rumbo.requestRumboHandoff(ctx.db, org, orgA.userId, { opportunityId: opportunity.id, projectName: "Otra", startDate: null, scopeSummary: null, responsibleUserId: null });
    assert.equal(resend.ok, false, "no se reenvía un proyecto ya confirmado");
    assert.equal(await ctx.db.rumboHandoff.count({ where: { opportunityId: opportunity.id } }), 1);
  });
});

describe("Escenario G — multi-tenancy", { skip }, () => {
  it("una organización no consulta, modifica ni asocia registros de otra", async () => {
    const ctxA = ctxFor(orgA);
    const ctxB = ctxFor(orgB);
    const leadA = unwrap(await m.leads.createCommercialLead(ctxA, { companyName: `Privada ${suffix}` }));
    const leadRow = await ctxA.db.commercialLead.findUniqueOrThrow({ where: { id: leadA.id } });
    const opportunityA = await ctxA.db.opportunity.findFirstOrThrow();
    const partnerA = await ctxA.db.commercialPartner.findFirstOrThrow();

    assert.equal(await ctxB.db.commercialLead.findUnique({ where: { id: leadA.id } }), null);
    assert.equal(await ctxB.db.opportunity.findUnique({ where: { id: opportunityA.id } }), null);
    assert.equal(await ctxB.db.commercialPartner.findUnique({ where: { id: partnerA.id } }), null);
    assert.equal((await m.leads.changeLeadStatus(ctxB, leadA.id, { status: "disqualified", reason: "x" })).ok, false);
    assert.equal((await m.opportunityService.changeOpportunityStage(ctxB, { opportunityId: opportunityA.id, stage: "calificada" })).ok, false);
    assert.equal((await m.leads.createCommercialLead(ctxB, { companyId: leadRow.companyId })).ok, false, "no asocia una empresa ajena");
    assert.equal((await m.leads.createCommercialLead(ctxB, { companyName: "B", attribution: { referrerPartnerId: partnerA.id } })).ok, false, "no asocia un partner ajeno");
    const links = await m.links.resolveRecordLinks(ctxB.db, { commercialLeadId: leadA.id });
    assert.equal(links.ok, false);
    assert.equal((await m.partners.changeAlliance(ctxB, partnerA.id, { stage: "contacted" })).ok, false);

    // Segunda barrera: RLS bloquea aunque se omita el filtro de app.
    if (process.env.INTEGRATION_TENANT_DATABASE_URL) {
      const visible = await m.prisma.prismaTenantBase.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgB.id}, true)`;
        return tx.commercialLead.count({ where: { id: leadA.id } });
      });
      assert.equal(visible, 0);
    }
  });
});
