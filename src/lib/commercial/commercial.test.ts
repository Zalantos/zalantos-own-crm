import assert from "node:assert/strict";
import test from "node:test";
import { addBusinessDays } from "./business-days";
import { assertEconomicAmounts, calculateProfitShares } from "./economics";
import {
  extractCommercialOffer,
  fingerprintCommercialSources,
} from "./backfill";
import { personCompanyRelationshipsSchema } from "../zod/person-company";

test("calcula 15 días hábiles excluyendo fin de semana y feriado", () => {
  const result = addBusinessDays(new Date("2026-10-06T12:00:00.000Z"), 15, [
    "2026-10-12",
  ]);
  assert.equal(result.toISOString().slice(0, 10), "2026-10-28");
});

test("valida costo + utilidad = precio neto", () => {
  assert.doesNotThrow(() =>
    assertEconomicAmounts({
      status: "sent",
      economicBaseNetAmount: "10000000",
      projectCostAmount: "4000000",
      distributableProfitAmount: "6000000",
    }),
  );
  assert.throws(
    () =>
      assertEconomicAmounts({
        status: "sent",
        economicBaseNetAmount: "10000000",
        projectCostAmount: "3000000",
        distributableProfitAmount: "6000000",
      }),
    /debe coincidir/,
  );
});

test("permite precio histórico parcial en borrador pero no al enviar", () => {
  assert.doesNotThrow(() =>
    assertEconomicAmounts({ status: "draft", economicBaseNetAmount: 84 }),
  );
  assert.throws(
    () => assertEconomicAmounts({ status: "sent", economicBaseNetAmount: 84 }),
    /requiere precio neto, costo y utilidad completos/,
  );
});

test("reparte utilidad 50/50 sin repartir el costo", () => {
  const result = calculateProfitShares("6000000", [
    {
      beneficiaryType: "organization",
      beneficiaryNameSnapshot: "Zalantos",
      percentage: 50,
    },
    {
      beneficiaryType: "partner",
      commercialPartnerId: "partner-1",
      beneficiaryNameSnapshot: "Partner",
      percentage: 50,
    },
  ]);
  assert.deepEqual(
    result.map((share) => share.amount.toString()),
    ["3000000", "3000000"],
  );
});

test("rechaza porcentajes que no suman 100", () => {
  assert.throws(
    () =>
      calculateProfitShares(100, [
        {
          beneficiaryType: "organization",
          beneficiaryNameSnapshot: "Zalantos",
          percentage: 60,
        },
        {
          beneficiaryType: "partner",
          commercialPartnerId: "partner-1",
          beneficiaryNameSnapshot: "Partner",
          percentage: 30,
        },
      ]),
    /sumar exactamente 100/,
  );
});

test("extrae una oferta histórica sin inventar costo ni utilidad", () => {
  const extracted = extractCommercialOffer(
    "Oferente: Zalantos. Presenta: Tomás Rodríguez. Producto: CRM Light. " +
      "Estado: propuesta enviada, v3, 06-10-2026. Vigencia: 15 días hábiles, vence el 28-10-2026. " +
      "DOLOR Falta seguimiento.  PROPUESTA: Cola comercial priorizada.  " +
      "IMPLEMENTACIÓN: 84 UF + IVA.  CONDICIONES COMERCIALES: Año 1 estimado: 145,2 UF + IVA.  " +
      "RIESGOS: Adopción.  PRÓXIMOS PASOS: Taller.",
  );
  assert.equal(extracted.presenterNameSnapshot, "Tomás Rodríguez");
  assert.equal(extracted.status, "sent");
  assert.equal(extracted.versionNumber, 3);
  assert.equal(extracted.sentAt?.slice(0, 10), "2026-10-06");
  assert.equal(extracted.validUntil?.slice(0, 10), "2026-10-28");
  assert.equal(extracted.economicScope, "first_year");
  assert.equal(extracted.economicBaseNetAmount, 145.2);
  assert.equal(extracted.pricingUnit, "UF");
  assert.equal(extracted.partnerEvidence.length, 0);
});

test("el fingerprint es estable aunque cambie el orden de las fuentes", () => {
  const a = fingerprintCommercialSources("opp-1", [
    { id: "b", text: "texto dos" },
    { id: "a", text: "texto uno" },
  ]);
  const b = fingerprintCommercialSources("opp-1", [
    { id: "a", text: "texto uno" },
    { id: "b", text: "texto dos" },
  ]);
  assert.equal(a, b);
});

test("exige empresas sin duplicar y una sola relación principal activa", () => {
  assert.equal(
    personCompanyRelationshipsSchema.safeParse([
      {
        companyId: "company-1",
        roles: ["owner", "contact"],
        isPrimary: true,
      },
      {
        companyId: "company-2",
        roles: ["partner"],
        isPrimary: false,
      },
    ]).success,
    true,
  );
  assert.equal(
    personCompanyRelationshipsSchema.safeParse([
      { companyId: "company-1", roles: ["contact"], isPrimary: true },
      { companyId: "company-1", roles: ["owner"], isPrimary: false },
    ]).success,
    false,
  );
});
