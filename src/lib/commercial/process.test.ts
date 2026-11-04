import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { checkStageTransition, type StageGateFacts } from "../opportunities/stage-gates";
import { buildStatusChange } from "../opportunities/status";
import { buildLeadStatusChange } from "./leads";
import {
  leadSuggestions,
  nextActionState,
  opportunitySuggestions,
  type OpportunityActionFacts,
} from "./next-action";
import { computeFunnel, durationStat, type LeadRow, type OpportunityRow } from "./funnel";
import { inferSourceChannel, normalizeCampaignKey, resolveChannel } from "./attribution";
import { buildRumboHandoffPayload } from "./rumbo";
import { matchesConditions } from "../workflows/conditions";
import { normalizeStageKey, boardStages } from "../pipeline/stages";
import { inboundLeadPayloadSchema } from "../zod/inbound-lead";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000);

const openFacts: StageGateFacts = {
  status: "open",
  mainPain: null,
  proposalDecisionAt: null,
  proposalSentAt: null,
  hasSentOffer: false,
  hasInteractionAfterProposal: false,
};

describe("compuertas de etapa", () => {
  it("Discovery → Calificada exige Pain", () => {
    const blocked = checkStageTransition("reunion_discovery", "calificada", openFacts);
    assert.equal(blocked.ok, false);
    const ok = checkStageTransition("reunion_discovery", "calificada", { ...openFacts, mainPain: "Procesos manuales" });
    assert.equal(ok.ok, true);
  });

  it("Propuesta enviada exige decisión y envío real, no un borrador", () => {
    const decided = { ...openFacts, mainPain: "x", proposalDecisionAt: day(-3) };
    const draftOnly = checkStageTransition("calificada", "propuesta_principal", decided);
    assert.equal(draftOnly.ok, false);
    assert.match(draftOnly.ok ? "" : draftOnly.error, /envío real/);
    const sent = checkStageTransition("calificada", "propuesta_principal", { ...decided, hasSentOffer: true });
    assert.equal(sent.ok, true);
  });

  it("Negociación exige interacción posterior al envío", () => {
    const facts = { ...openFacts, mainPain: "x", proposalSentAt: day(-5) };
    assert.equal(checkStageTransition("propuesta_principal", "negociacion", facts).ok, false);
    assert.equal(
      checkStageTransition("propuesta_principal", "negociacion", { ...facts, hasInteractionAfterProposal: true }).ok,
      true,
    );
  });

  it("saltar etapas acumula requisitos y retroceder no exige nada", () => {
    const jump = checkStageTransition("reunion_discovery", "negociacion", openFacts);
    assert.equal(jump.ok, false);
    assert.ok(!jump.ok && jump.missing.length >= 3);
    assert.equal(checkStageTransition("negociacion", "reunion_discovery", openFacts).ok, true);
  });

  it("una oportunidad pausada no se mueve de etapa", () => {
    const result = checkStageTransition("reunion_discovery", "calificada", { ...openFacts, status: "paused", mainPain: "x" });
    assert.equal(result.ok, false);
  });
});

describe("estados de oportunidad", () => {
  it("pausar exige motivo y fecha o criterio, y conserva la etapa (no toca stageId)", () => {
    assert.equal(buildStatusChange({ status: "open" }, { status: "paused", reason: "Sin presupuesto" }, "u").ok, false);
    const result = buildStatusChange(
      { status: "open" },
      { status: "paused", reason: "Sin presupuesto", reactivateAt: day(30) },
      "u",
      NOW,
    );
    assert.ok(result.ok);
    assert.equal(result.data.pauseReason, "Sin presupuesto");
    assert.equal("stageId" in result.data, false);
  });

  it("ganar exige evidencia verificable y no acepta fecha futura", () => {
    assert.equal(buildStatusChange({ status: "open" }, { status: "won" }, "u").ok, false);
    assert.equal(
      buildStatusChange({ status: "open" }, { status: "won", wonEvidence: "OC 123", closedAt: day(5) }, "u", NOW).ok,
      false,
    );
    const won = buildStatusChange({ status: "open" }, { status: "won", wonEvidence: "Contrato firmado" }, "u", NOW);
    assert.ok(won.ok);
    assert.equal(won.data.closedById, "u");
  });

  it("perder exige motivo; reabrir una cerrada exige motivo; archivada no cambia", () => {
    assert.equal(buildStatusChange({ status: "open" }, { status: "lost" }, "u").ok, false);
    assert.ok(buildStatusChange({ status: "open" }, { status: "lost", lossReason: "PRICE" }, "u").ok);
    assert.equal(buildStatusChange({ status: "won" }, { status: "open" }, "u").ok, false);
    assert.ok(buildStatusChange({ status: "won" }, { status: "open", reason: "Contrato anulado" }, "u").ok);
    assert.equal(buildStatusChange({ status: "archived" }, { status: "open", reason: "x" }, "u").ok, false);
  });
});

describe("prospección", () => {
  const prospect = { status: "prospect", firstContactAt: null, becameLeadAt: null };

  it("contactado exige evidencia del intento de contacto", () => {
    assert.equal(buildLeadStatusChange(prospect, { status: "contacted" }, false).ok, false);
    const result = buildLeadStatusChange(prospect, { status: "contacted", at: NOW }, true);
    assert.ok(result.ok);
    assert.equal(result.data.firstContactAt?.toISOString(), NOW.toISOString());
  });

  it("lead exige señal de interés y conserva la primera fecha", () => {
    assert.equal(buildLeadStatusChange(prospect, { status: "lead" }, false).ok, false);
    const result = buildLeadStatusChange(
      { status: "contacted", firstContactAt: day(-3), becameLeadAt: day(-1) },
      { status: "lead", interestSignal: "Pidió propuesta" },
      true,
    );
    assert.ok(result.ok);
    assert.equal(result.data.becameLeadAt, undefined);
  });

  it("convertido solo se alcanza creando una oportunidad", () => {
    assert.equal(buildLeadStatusChange({ ...prospect, status: "lead" }, { status: "converted" }, true).ok, false);
  });
});

describe("próxima mejor acción", () => {
  const base: OpportunityActionFacts = {
    status: "open",
    stageKey: "propuesta_principal",
    ownerId: "u",
    nextStep: "Llamar",
    nextStepDueDate: day(2),
    nextStepUpdatedAt: day(-10),
    proposalSentAt: day(-7),
    expectedResponseAt: null,
    reactivateAt: null,
    lastInteractionAt: null,
    lastMeetingAt: null,
    overdueTasks: [],
  };

  it("propuesta enviada sin respuesta sugiere llamar al decisor", () => {
    const codes = opportunitySuggestions(base, NOW).map((suggestion) => suggestion.code);
    assert.ok(codes.includes("proposal_no_response"));
    const replied = opportunitySuggestions({ ...base, lastInteractionAt: day(-1) }, NOW).map((s) => s.code);
    assert.ok(!replied.includes("proposal_no_response"));
  });

  it("detecta acción faltante, vencida y pausa por reactivar", () => {
    assert.equal(nextActionState(null, null, NOW), "missing");
    assert.equal(nextActionState("x", day(-2), NOW), "overdue");
    const missing = opportunitySuggestions({ ...base, nextStep: null, nextStepDueDate: null }, NOW);
    assert.ok(missing.some((s) => s.code === "missing_next_action"));
    const paused = opportunitySuggestions({ ...base, status: "paused", reactivateAt: day(-1) }, NOW);
    assert.deepEqual(paused.map((s) => s.code), ["paused_reactivation_due"]);
  });

  it("reunión sin próximo paso y lead sin responsable", () => {
    const meeting = opportunitySuggestions({ ...base, lastMeetingAt: day(-1) }, NOW);
    assert.ok(meeting.some((s) => s.code === "meeting_without_next_step"));
    const lead = leadSuggestions(
      {
        status: "lead",
        ownerId: null,
        createdVia: "inbound_lead",
        firstContactAt: null,
        becameLeadAt: day(-20),
        lastInteractionAt: null,
        nextStep: null,
        nextStepDueDate: null,
        opportunityCount: 0,
        overdueTasks: [],
      },
      NOW,
    ).map((s) => s.code);
    assert.ok(lead.includes("lead_without_owner"));
    assert.ok(lead.includes("lead_without_opportunity"));
  });

  it("las sugerencias no aplican a registros cerrados", () => {
    assert.equal(opportunitySuggestions({ ...base, status: "won" }, NOW).length, 0);
  });
});

describe("funnel comercial", () => {
  const lead = (overrides: Partial<LeadRow>): LeadRow => ({
    id: "l",
    status: "prospect",
    ownerId: "u1",
    identifiedAt: day(-20),
    firstContactAt: null,
    becameLeadAt: null,
    convertedAt: null,
    sourceChannel: "referral",
    campaignId: null,
    referrerPartnerId: null,
    ...overrides,
  });
  const opportunity = (overrides: Partial<OpportunityRow>): OpportunityRow => ({
    id: "o",
    status: "open",
    ownerId: "u1",
    createdAt: day(-10),
    estimatedValue: 1000,
    recurringValue: null,
    probability: 50,
    nextStep: "x",
    nextStepDueDate: day(3),
    qualifiedAt: null,
    proposalSentAt: null,
    wonAt: null,
    lostAt: null,
    sprint0ScheduledAt: null,
    sprint0CompletedAt: null,
    diagnosisDeliveredAt: null,
    sourceChannel: "campaign",
    campaignId: "c1",
    partnerIds: [],
    ...overrides,
  });

  it("usa cohortes y fechas reales, no stock / stock", () => {
    const period = { from: day(-30), to: NOW };
    const report = computeFunnel(
      [
        lead({ id: "l1", firstContactAt: day(-18), becameLeadAt: day(-15), convertedAt: day(-10) }),
        lead({ id: "l2" }),
        lead({ id: "old", identifiedAt: day(-100), firstContactAt: day(-5) }),
      ],
      [
        opportunity({ id: "o1", status: "won", wonAt: day(-2), proposalSentAt: day(-6), qualifiedAt: day(-8) }),
        opportunity({ id: "o2", nextStep: null }),
        opportunity({ id: "o3", status: "lost", lostAt: day(-1) }),
      ],
      period,
      { overdueCommercialTasks: 2 },
      NOW,
    );
    assert.equal(report.volume.prospectsCreated, 2);
    assert.equal(report.volume.contacted, 2);
    assert.equal(report.cohort.leads.size, 2);
    assert.equal(report.cohort.leads.convertedRate, 0.5);
    assert.equal(report.cohort.opportunities.winRateClosed, 0.5);
    assert.equal(report.pipeline.openCount, 1);
    assert.equal(report.pipeline.withoutNextAction, 1);
    assert.equal(report.pipeline.weightedValue, 500);
    assert.equal(report.byCampaign[0]?.won, 1);
    assert.equal(report.durations.proposalToWon.n, 1);
  });

  it("los tiempos excluyen fechas desconocidas e informan n", () => {
    const stat = durationStat([
      [day(-10), day(-5)],
      [null, day(-1)],
      [day(-4), null],
    ]);
    assert.equal(stat.n, 1);
    assert.equal(stat.medianDays, 5);
  });
});

describe("atribución", () => {
  it("mapea textos legacy sin inventar campaña", () => {
    assert.equal(inferSourceChannel("Referido por Juan"), "referral");
    assert.equal(inferSourceChannel("LinkedIn"), "linkedin_organic");
    assert.equal(inferSourceChannel("algo raro"), "other");
    assert.equal(resolveChannel({ referrerPartnerId: "p" }), "partner");
    assert.equal(resolveChannel({ utmCampaign: "x" }), "campaign");
    assert.equal(normalizeCampaignKey("Webinar Ñuñoa 2026!"), "webinar-nunoa-2026");
  });

  it("el contrato inbound acepta UTM opcionales y sigue aceptando el payload previo", () => {
    const legacy = inboundLeadPayloadSchema.safeParse({ source: "website_contact", external_id: "1" });
    assert.ok(legacy.success);
    const extended = inboundLeadPayloadSchema.safeParse({
      source: "website_contact",
      external_id: "2",
      utm_campaign: "otoño",
      source_channel: "campaign",
      first_touch_at: "2026-10-01T10:00:00Z",
    });
    assert.ok(extended.success);
    const invalid = inboundLeadPayloadSchema.safeParse({ source: "x", external_id: "3", source_channel: "tiktok" });
    assert.equal(invalid.success, false);
  });
});

describe("traspaso a Rumbo", () => {
  it("el payload es versionado, no incluye tareas comerciales y no inventa datos", () => {
    const payload = buildRumboHandoffPayload({
      organization: { id: "org", name: "Org", slug: "org" },
      opportunity: {
        id: "op",
        name: "Proyecto",
        status: "won",
        wonAt: NOW,
        wonEvidence: "Contrato",
        estimatedValue: new Prisma.Decimal(1000),
        recurringValue: null,
        mainPain: "Dolor",
        situation: null,
        impact: null,
        nextStep: null,
      },
      company: { id: "co", name: "Acme", website: null },
      owner: null,
      decisionMaker: null,
      sponsor: null,
      acceptedOffer: null,
      handoff: { projectName: "Acme · Proyecto", startDate: null, scopeSummary: null, responsibleUserId: null },
      crmUrl: "https://crm/opportunities/op",
    });
    assert.equal(payload.version, "2026-11-01");
    assert.equal(payload.opportunity.estimatedMonthlyRecurringValue, null);
    assert.equal("tasks" in payload, false);
    assert.equal(payload.project.agreedScope, null);
  });
});

describe("compatibilidad", () => {
  it("las condiciones de workflow aceptan id o key de etapa", () => {
    const event = {
      entityType: "opportunity" as const,
      entityId: "o",
      eventName: "stage_changed" as const,
      before: { stage: "id-1", stageKey: "calificada" },
      after: { stage: "id-2", stageKey: "propuesta_principal" },
    };
    assert.ok(matchesConditions([{ field: "stage", op: "changed_to", value: "id-2" }], event));
    assert.ok(matchesConditions([{ field: "stage", op: "changed_to", value: "propuesta_principal" }], event));
    assert.equal(matchesConditions([{ field: "stage", op: "changed_to", value: "negociacion" }], event), false);
  });

  it("alias de etapas y tablero sin etapas terminales", () => {
    assert.equal(normalizeStageKey("propuesta_enviada"), "propuesta_principal");
    assert.equal(normalizeStageKey("Discovery"), "reunion_discovery");
    const stages = [
      { id: "1", key: "reunion_discovery", label: "D", color: null, sortOrder: 0, isWon: false, isLost: false },
      { id: "2", key: "ganado", label: "G", color: null, sortOrder: 1, isWon: true, isLost: false },
    ];
    assert.deepEqual(boardStages(stages).map((stage) => stage.key), ["reunion_discovery"]);
  });
});
