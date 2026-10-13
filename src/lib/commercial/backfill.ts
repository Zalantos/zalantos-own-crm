import { createHash } from "node:crypto";
import { z } from "zod";

const offerStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "superseded",
]);

const extractedLineItemSchema = z.object({
  type: z.string(),
  description: z.string(),
  amount: z.number().nonnegative(),
  pricingUnit: z.string(),
  frequency: z.string().nullable(),
  evidence: z.string(),
});

export const extractedCommercialOfferSchema = z.object({
  versionNumber: z.number().int().positive().nullable(),
  status: offerStatusSchema,
  offerorName: z.string(),
  presenterNameSnapshot: z.string().nullable(),
  productName: z.string().nullable(),
  sentAt: z.string().nullable(),
  validBusinessDays: z.number().int().positive().nullable(),
  validUntil: z.string().nullable(),
  pricingUnit: z.string(),
  plusVat: z.boolean(),
  economicScope: z.enum(["implementation", "first_year", "custom"]).nullable(),
  economicScopeLabel: z.string().nullable(),
  economicBaseNetAmount: z.number().nonnegative().nullable(),
  executiveSummary: z.string().nullable(),
  painSummary: z.string().nullable(),
  solutionSummary: z.string().nullable(),
  implementationPlan: z.string().nullable(),
  outOfScope: z.string().nullable(),
  commercialTerms: z.string().nullable(),
  risks: z.string().nullable(),
  nextSteps: z.string().nullable(),
  lineItems: z.array(extractedLineItemSchema),
  documents: z.array(
    z.object({ name: z.string(), externalUrl: z.string().url().nullable() }),
  ),
  partnerEvidence: z.array(z.string()),
  evidence: z.record(z.string(), z.string()),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)),
});

export type ExtractedCommercialOffer = z.infer<
  typeof extractedCommercialOfferSchema
>;

const SECTION_NAMES = [
  "DOLOR",
  "PROPUESTA",
  "IMPLEMENTACIÓN",
  "IMPLEMENTACION",
  "FUERA DE V1",
  "FUERA DE ALCANCE",
  "CONDICIONES COMERCIALES",
  "CONDICIONES",
  "RIESGOS Y PUNTOS ABIERTOS",
  "RIESGOS",
  "PRÓXIMOS PASOS",
  "PROXIMOS PASOS",
  "DOCUMENTOS",
] as const;

const SECTION_PATTERN = new RegExp(
  `(?:^|\\s{2,}|\\n)(${SECTION_NAMES.join("|")})\\s*:?\\s*`,
  "giu",
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function labelValue(text: string, label: string, followingLabels: string[]) {
  const stop = followingLabels.map((entry) => `${entry}:`).join("|");
  const match = text.match(
    new RegExp(`${label}:\\s*(.+?)(?=\\.\\s*(?:${stop})|$)`, "iu"),
  );
  return match ? compact(match[1].replace(/\.$/, "")) : null;
}

function parseSpanishNumber(raw: string) {
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, "");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function parseDate(raw: string | undefined) {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})[-/]([01]?\d)[-/](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sectionMap(text: string) {
  const matches = [...text.matchAll(SECTION_PATTERN)];
  const sections = new Map<string, string>();
  for (const [index, match] of matches.entries()) {
    const name = match[1].toUpperCase();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const value = compact(text.slice(start, end));
    if (value) sections.set(name, value);
  }
  return sections;
}

function extractMoneyMatches(text: string) {
  const matches: Array<{
    amount: number;
    unit: string;
    evidence: string;
    index: number;
  }> = [];
  const pattern = /(\d[\d.]*?(?:,\d+)?)\s*(UF|CLP|USD)\b/giu;
  for (const match of text.matchAll(pattern)) {
    const amount = parseSpanishNumber(match[1]);
    if (amount === null) continue;
    matches.push({
      amount,
      unit: match[2].toUpperCase(),
      evidence: compact(
        text.slice(
          Math.max(0, (match.index ?? 0) - 55),
          (match.index ?? 0) + match[0].length + 55,
        ),
      ),
      index: match.index ?? 0,
    });
  }
  return matches;
}

function lineItems(text: string) {
  const result: ExtractedCommercialOffer["lineItems"] = [];
  const seen = new Set<string>();
  for (const money of extractMoneyMatches(text)) {
    const context = money.evidence.toLowerCase();
    let type: string | null = null;
    let frequency: string | null = null;
    if (/implementaci[oó]n/.test(context)) type = "implementation";
    else if (/hito|\bh[123]\b/.test(context)) type = "milestone";
    else if (/mensual|mes \d|desde el mes/.test(context)) {
      type = "monthly_service";
      frequency = "monthly";
    } else if (/hora adicional|por hora/.test(context)) {
      type = "additional_hour";
      frequency = "hourly";
    } else if (/año 1|ano 1/.test(context)) type = "first_year_total";
    if (!type) continue;
    const key = `${type}:${money.amount}:${money.unit}:${money.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      type,
      description: money.evidence.slice(0, 240),
      amount: money.amount,
      pricingUnit: money.unit,
      frequency,
      evidence: money.evidence,
    });
  }
  return result.slice(0, 30);
}

function documents(text: string) {
  const section = sectionMap(text).get("DOCUMENTOS") ?? "";
  if (!section) return [];
  const urls = [...section.matchAll(/https?:\/\/[^\s)\]]+/giu)].map((match) =>
    match[0].replace(/[.,;]+$/, ""),
  );
  const names = section.split(/[•;]/).map(compact).filter(Boolean).slice(0, 20);
  if (urls.length === 0) {
    return names.map((name) => ({
      name: name.slice(0, 240),
      externalUrl: null,
    }));
  }
  return urls.map((url, index) => ({
    name: (names[index] ?? `Documento ${index + 1}`).slice(0, 240),
    externalUrl: url,
  }));
}

function findEconomicBase(text: string) {
  const yearOne = text.match(
    /a(?:ñ|n)o\s*1(?:\s+estimado)?\s*(?::|en)?\s*(\d[\d.]*?(?:,\d+)?)\s*(UF|CLP|USD)/iu,
  );
  if (yearOne) {
    return {
      amount: parseSpanishNumber(yearOne[1]),
      unit: yearOne[2].toUpperCase(),
      scope: "first_year" as const,
      label: "Año 1",
      evidence: yearOne[0],
    };
  }
  const implementation = text.match(
    /implementaci[oó]n\s*(?::|de)?\s*(\d[\d.]*?(?:,\d+)?)\s*(UF|CLP|USD)/iu,
  );
  if (implementation) {
    return {
      amount: parseSpanishNumber(implementation[1]),
      unit: implementation[2].toUpperCase(),
      scope: "implementation" as const,
      label: "Implementación",
      evidence: implementation[0],
    };
  }
  return null;
}

export function fingerprintCommercialSources(
  opportunityId: string,
  sources: Array<{ id: string; text: string }>,
) {
  const canonical = sources
    .map((source) => `${source.id}:${compact(source.text)}`)
    .sort()
    .join("\n");
  return createHash("sha256")
    .update(`${opportunityId}\n${canonical}`)
    .digest("hex");
}

export function extractCommercialOffer(textInput: string) {
  const text = compact(textInput.replace(/\r/g, "\n"));
  const sections = sectionMap(textInput.replace(/\r/g, "\n"));
  const following = ["Presenta", "Producto", "Estado", "Vigencia", "Valor"];
  const offerorName = labelValue(text, "Oferente", following) ?? "Zalantos";
  const presenterNameSnapshot = labelValue(text, "Presenta", following);
  const productName = labelValue(text, "Producto", following);
  const statusText = labelValue(text, "Estado", following) ?? "";
  const sentAt = parseDate(statusText);
  const validDaysMatch = text.match(
    /vigencia:\s*(\d+)\s*d[ií]as\s*h[aá]biles/iu,
  );
  const validUntilMatch = text.match(
    /vence[^.]{0,80}?(\d{1,2}[-/]\d{1,2}[-/]\d{4})/iu,
  );
  const versionMatch = statusText.match(/\bv\s*(\d+)\b/iu);
  const economic = findEconomicBase(text);
  const evidence: Record<string, string> = {};
  const fieldConfidence: Record<string, number> = {};
  if (statusText) evidence.status = statusText;
  if (statusText) fieldConfidence.status = 0.95;
  if (economic) {
    evidence.economicBaseNetAmount = economic.evidence;
    fieldConfidence.economicBaseNetAmount = 0.9;
    fieldConfidence.economicScope = 0.9;
  }
  if (presenterNameSnapshot) {
    evidence.presenterNameSnapshot = `Presenta: ${presenterNameSnapshot}`;
    fieldConfidence.presenterNameSnapshot = 0.95;
  }
  if (productName) {
    evidence.productName = `Producto: ${productName}`;
    fieldConfidence.productName = 0.95;
  }

  const sectionEvidence: Array<[string, string | null]> = [
    ["painSummary", sections.get("DOLOR") ?? null],
    ["solutionSummary", sections.get("PROPUESTA") ?? null],
    [
      "implementationPlan",
      sections.get("IMPLEMENTACIÓN") ?? sections.get("IMPLEMENTACION") ?? null,
    ],
    [
      "outOfScope",
      sections.get("FUERA DE V1") ?? sections.get("FUERA DE ALCANCE") ?? null,
    ],
    [
      "commercialTerms",
      sections.get("CONDICIONES COMERCIALES") ??
        sections.get("CONDICIONES") ??
        null,
    ],
    [
      "risks",
      sections.get("RIESGOS Y PUNTOS ABIERTOS") ??
        sections.get("RIESGOS") ??
        null,
    ],
    [
      "nextSteps",
      sections.get("PRÓXIMOS PASOS") ?? sections.get("PROXIMOS PASOS") ?? null,
    ],
  ];
  for (const [field, value] of sectionEvidence) {
    if (!value) continue;
    evidence[field] = value.slice(0, 500);
    fieldConfidence[field] = 0.85;
  }

  let status: ExtractedCommercialOffer["status"] = "draft";
  if (/aceptad[ao]/iu.test(statusText)) status = "accepted";
  else if (/rechazad[ao]/iu.test(statusText)) status = "rejected";
  else if (/vencid[ao]|expirad[ao]/iu.test(statusText)) status = "expired";
  else if (/enviad[ao]/iu.test(statusText)) status = "sent";

  const partnerEvidence = (
    textInput.match(
      /[^.\n]{0,100}\b(?:partners?|referidor(?:a|es|as)?|distribuidor(?:a|es|as)?|socios? comerciales?)\b[^.\n]{0,160}/giu,
    ) ?? []
  ).map(compact);

  const result: ExtractedCommercialOffer = {
    versionNumber: versionMatch ? Number(versionMatch[1]) : null,
    status,
    offerorName,
    presenterNameSnapshot,
    productName,
    sentAt,
    validBusinessDays: validDaysMatch ? Number(validDaysMatch[1]) : null,
    validUntil: parseDate(validUntilMatch?.[1]),
    pricingUnit: economic?.unit ?? extractMoneyMatches(text)[0]?.unit ?? "CLP",
    plusVat: /\+\s*IVA|m[aá]s\s+IVA/iu.test(text),
    economicScope: economic?.scope ?? null,
    economicScopeLabel: economic?.label ?? null,
    economicBaseNetAmount: economic?.amount ?? null,
    executiveSummary: null,
    painSummary: sections.get("DOLOR") ?? null,
    solutionSummary: sections.get("PROPUESTA") ?? null,
    implementationPlan:
      sections.get("IMPLEMENTACIÓN") ?? sections.get("IMPLEMENTACION") ?? null,
    outOfScope:
      sections.get("FUERA DE V1") ?? sections.get("FUERA DE ALCANCE") ?? null,
    commercialTerms:
      sections.get("CONDICIONES COMERCIALES") ??
      sections.get("CONDICIONES") ??
      null,
    risks:
      sections.get("RIESGOS Y PUNTOS ABIERTOS") ??
      sections.get("RIESGOS") ??
      null,
    nextSteps:
      sections.get("PRÓXIMOS PASOS") ?? sections.get("PROXIMOS PASOS") ?? null,
    lineItems: lineItems(text),
    documents: documents(textInput),
    partnerEvidence,
    evidence,
    fieldConfidence,
  };
  return extractedCommercialOfferSchema.parse(result);
}

export function extractionConfidence(extracted: ExtractedCommercialOffer) {
  let score = 0.2;
  if (extracted.productName) score += 0.1;
  if (extracted.sentAt) score += 0.1;
  if (extracted.economicBaseNetAmount !== null) score += 0.2;
  const populatedSections = [
    extracted.painSummary,
    extracted.solutionSummary,
    extracted.implementationPlan,
    extracted.commercialTerms,
    extracted.risks,
    extracted.nextSteps,
  ].filter(Boolean).length;
  score += Math.min(0.3, populatedSections * 0.05);
  if (extracted.documents.length > 0) score += 0.05;
  return Math.min(1, Number(score.toFixed(2)));
}
