import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alertAdvice,
  alertDedupeKey,
  elapsedDays,
  evaluateAlertRule,
  highestSeverity,
  isValidRuleTarget,
  type AlertFacts,
  type AlertRuleInput,
} from "./alerts";
import { businessDaysBetween } from "./business-days";
import { mergeAlertSuggestions, type AlertView } from "./alert-service";
import type { NextActionSuggestion } from "./next-action";

const NOW = new Date("2026-11-04T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const rule = (overrides: Partial<AlertRuleInput> = {}): AlertRuleInput => ({
  id: "rule",
  pipeline: "opportunity",
  stageKey: "propuesta_principal",
  condition: "no_interaction",
  thresholdDays: 5,
  dayType: "calendar",
  severity: "warning",
  ...overrides,
});

const facts = (overrides: Partial<AlertFacts> = {}): AlertFacts => ({
  status: "open",
  stageKey: "propuesta_principal",
  stageLabel: "Propuesta enviada",
  stageEnteredAt: daysAgo(10),
  lastInteractionAt: null,
  nextStep: "Llamar",
  nextStepDueDate: daysAgo(-3),
  reactivateAt: null,
  createdAt: daysAgo(30),
  ...overrides,
});

describe("evaluación de reglas por etapa", () => {
  it("solo evalúa la etapa de la regla", () => {
    assert.equal(evaluateAlertRule(rule({ stageKey: "negociacion" }), facts(), NOW), null);
  });

  it("detenido en etapa usa la fecha real de entrada y no inventa fechas legacy", () => {
    const stale = rule({ condition: "stage_stale", thresholdDays: 7 });
    const hit = evaluateAlertRule(stale, facts(), NOW);
    assert.equal(hit?.elapsedDays, 10);
    assert.equal(hit?.anchorAt.getTime(), daysAgo(10).getTime());
    assert.match(hit?.reason ?? "", /Entró a Propuesta enviada el/);
    assert.equal(evaluateAlertRule(stale, facts({ stageEnteredAt: null }), NOW), null);
    assert.equal(evaluateAlertRule(rule({ condition: "stage_stale", thresholdDays: 11 }), facts(), NOW), null);
  });

  it("sin interacción corre desde lo más reciente entre interacción y entrada", () => {
    assert.equal(evaluateAlertRule(rule(), facts({ lastInteractionAt: daysAgo(2) }), NOW), null);
    const hit = evaluateAlertRule(rule(), facts({ lastInteractionAt: daysAgo(6) }), NOW);
    assert.equal(hit?.elapsedDays, 6);
    assert.match(hit?.reason ?? "", /Última interacción/);
    // Interacción anterior a entrar a la etapa: cuenta desde la entrada.
    const older = evaluateAlertRule(rule(), facts({ lastInteractionAt: daysAgo(40) }), NOW);
    assert.equal(older?.elapsedDays, 10);
  });

  it("sin próxima acción y acción vencida", () => {
    const missing = rule({ condition: "no_next_action", thresholdDays: 0 });
    assert.equal(evaluateAlertRule(missing, facts(), NOW), null);
    assert.ok(evaluateAlertRule(missing, facts({ nextStep: "  " }), NOW));
    const overdue = rule({ condition: "next_action_overdue", thresholdDays: 1 });
    assert.equal(evaluateAlertRule(overdue, facts(), NOW), null);
    assert.ok(evaluateAlertRule(overdue, facts({ nextStepDueDate: daysAgo(2) }), NOW));
  });

  it("reactivación solo aplica a pausadas con fecha alcanzada", () => {
    const due = rule({ stageKey: "paused", condition: "reactivation_due", thresholdDays: 0 });
    const paused = facts({ status: "paused", stageKey: "paused", stageLabel: "Pausada" });
    assert.equal(evaluateAlertRule(due, { ...paused, reactivateAt: daysAgo(-1) }, NOW), null);
    assert.ok(evaluateAlertRule(due, { ...paused, reactivateAt: daysAgo(1) }, NOW));
    assert.equal(isValidRuleTarget("paused", "stage_stale"), false);
    assert.equal(isValidRuleTarget("calificada", "reactivation_due"), false);
    assert.equal(isValidRuleTarget("paused", "reactivation_due"), true);
  });

  it("días hábiles descuentan fines de semana y feriados", () => {
    // Del viernes 30-oct al miércoles 4-nov: lun, mar, mié.
    const from = new Date("2026-10-30T12:00:00.000Z");
    assert.equal(businessDaysBetween(from, NOW), 3);
    assert.equal(businessDaysBetween(from, NOW, ["2026-11-02"]), 2);
    assert.equal(elapsedDays(from, NOW, "calendar"), 5);
    const business = rule({ condition: "stage_stale", thresholdDays: 4, dayType: "business" });
    assert.equal(evaluateAlertRule(business, facts({ stageEnteredAt: from }), NOW), null);
    assert.ok(evaluateAlertRule({ ...business, dayType: "calendar" }, facts({ stageEnteredAt: from }), NOW));
  });
});

describe("deduplicación y próxima mejor acción", () => {
  it("la clave depende del período, no del día en que se detecta", () => {
    const anchor = daysAgo(10);
    assert.equal(alertDedupeKey("r", "e", anchor), alertDedupeKey("r", "e", new Date(anchor)));
    assert.notEqual(alertDedupeKey("r", "e", anchor), alertDedupeKey("r", "e", daysAgo(3)));
  });

  it("ordena severidades", () => {
    assert.equal(highestSeverity(["info", "critical", "warning"]), "critical");
    assert.equal(highestSeverity([]), null);
  });

  it("la alerta lidera y reemplaza la sugerencia equivalente", () => {
    const fixed: NextActionSuggestion = {
      code: "proposal_no_response",
      title: "Llamar al decisor",
      channel: "call",
      reason: "x",
      severity: "warning",
      suggestedDueDate: null,
    };
    const other: NextActionSuggestion = { ...fixed, code: "task_overdue" };
    const alert = {
      id: "a",
      title: "6 días sin interacción en Propuesta enviada",
      reason: "Última interacción el 2026-10-29.",
      severity: "warning",
      status: "open",
      pipeline: "opportunity",
      stageKey: "propuesta_principal",
      condition: "no_interaction",
    } as AlertView;
    const merged = mergeAlertSuggestions([fixed, other], [alert], NOW);
    assert.deepEqual(merged.map((item) => item.code), ["alert:no_interaction", "task_overdue"]);
    assert.equal(merged[0].title, alertAdvice("opportunity", "propuesta_principal", "no_interaction").title);
    assert.match(merged[0].reason, /Última interacción/);
  });
});
