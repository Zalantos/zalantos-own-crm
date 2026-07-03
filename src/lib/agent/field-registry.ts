import type { CustomFieldDefinition, Prisma } from "@prisma/client";
import { OpportunityStage } from "@prisma/client";
import { getFieldDefinitions } from "@/lib/custom-fields/merge";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/zod/opportunity";

// Single source of truth for which fields the agent (and proposal apply
// engine) may write, per entity. Derived instead of hard-coded:
// - Static columns are type-checked against the Prisma update inputs, so a
//   renamed/removed column in schema.prisma becomes a compile error here.
// - Custom fields are loaded from CustomFieldDefinition at call time and
//   exposed under namespaced "custom.<fieldName>" keys (collision-proof).
// Everything NOT in the registry (ids, timestamps, companyId re-parenting,
// auth tables) is refused with "Campo no permitido".

export type AgentEntity = "company" | "opportunity" | "person";

export type FieldSpec = {
  type:
    | "string"
    | "text"
    | "int"
    | "decimal"
    | "boolean"
    | "date"
    | "enum"
    | "personRef";
  label: string;
  enumValues?: readonly string[];
  enumLabels?: Record<string, string>;
  min?: number;
  max?: number;
};

export type ResolvedField = FieldSpec & {
  // Present only for custom fields; needed to upsert CustomFieldValue.
  customDefinition?: CustomFieldDefinition;
};

const COMPANY_FIELDS = {
  name: { type: "string", label: "Nombre" },
  website: { type: "string", label: "Sitio web" },
  industry: { type: "string", label: "Industria" },
  size: { type: "string", label: "Tamaño" },
  country: { type: "string", label: "País" },
  city: { type: "string", label: "Ciudad" },
  linkedinUrl: { type: "string", label: "LinkedIn" },
  description: { type: "text", label: "Descripción" },
  status: { type: "string", label: "Estado" },
  icpScore: { type: "int", label: "Score ICP", min: 0, max: 100 },
  fitScore: { type: "int", label: "Score de fit", min: 0, max: 100 },
  painScore: { type: "int", label: "Score de dolor", min: 0, max: 100 },
} satisfies Partial<
  Record<keyof Prisma.CompanyUncheckedUpdateInput, FieldSpec>
>;

const OPPORTUNITY_FIELDS = {
  name: { type: "string", label: "Nombre" },
  stage: {
    type: "enum",
    label: "Etapa",
    enumValues: Object.values(OpportunityStage),
    enumLabels: OPPORTUNITY_STAGE_LABELS,
  },
  estimatedValue: { type: "decimal", label: "Valor estimado" },
  probability: { type: "int", label: "Probabilidad (%)", min: 0, max: 100 },
  source: { type: "string", label: "Origen" },
  mainPain: { type: "text", label: "Dolor principal" },
  urgency: { type: "string", label: "Urgencia" },
  nextStep: { type: "string", label: "Próximo paso" },
  nextStepDueDate: { type: "date", label: "Vencimiento del próximo paso" },
  expectedCloseDate: { type: "date", label: "Fecha estimada de cierre" },
  status: { type: "string", label: "Estado" },
  lossReason: { type: "string", label: "Motivo de pérdida" },
  decisionMakerId: { type: "personRef", label: "Decisor (id de persona)" },
  sponsorId: { type: "personRef", label: "Sponsor (id de persona)" },
} satisfies Partial<
  Record<keyof Prisma.OpportunityUncheckedUpdateInput, FieldSpec>
>;

const PERSON_FIELDS = {
  firstName: { type: "string", label: "Nombre" },
  lastName: { type: "string", label: "Apellido" },
  email: { type: "string", label: "Email" },
  phone: { type: "string", label: "Teléfono" },
  roleTitle: { type: "string", label: "Cargo" },
  linkedinUrl: { type: "string", label: "LinkedIn" },
  isDecisionMaker: { type: "boolean", label: "Es decisor" },
  isSponsor: { type: "boolean", label: "Es sponsor" },
  notes: { type: "text", label: "Notas" },
} satisfies Partial<Record<keyof Prisma.PersonUncheckedUpdateInput, FieldSpec>>;

const STATIC_FIELDS: Record<AgentEntity, Record<string, FieldSpec>> = {
  company: COMPANY_FIELDS,
  opportunity: OPPORTUNITY_FIELDS,
  person: PERSON_FIELDS,
};

export const CUSTOM_FIELD_PREFIX = "custom.";

function customFieldSpec(definition: CustomFieldDefinition): FieldSpec {
  switch (definition.fieldType) {
    case "text":
      return { type: "text", label: definition.fieldLabel };
    case "number":
      return { type: "decimal", label: definition.fieldLabel };
    case "boolean":
      return { type: "boolean", label: definition.fieldLabel };
    case "date":
      return { type: "date", label: definition.fieldLabel };
    case "select":
    case "multiselect": {
      const options = Array.isArray(definition.optionsJson)
        ? definition.optionsJson.map((option) => String(option))
        : [];
      return {
        type: "enum",
        label: definition.fieldLabel,
        enumValues: options,
      };
    }
  }
}

export function getStaticFields(
  entity: AgentEntity,
): Record<string, FieldSpec> {
  return STATIC_FIELDS[entity];
}

export async function getWritableFields(
  entity: AgentEntity,
): Promise<Record<string, ResolvedField>> {
  const fields: Record<string, ResolvedField> = { ...STATIC_FIELDS[entity] };
  const definitions = await getFieldDefinitions(entity);
  for (const definition of definitions) {
    fields[`${CUSTOM_FIELD_PREFIX}${definition.fieldName}`] = {
      ...customFieldSpec(definition),
      customDefinition: definition,
    };
  }
  return fields;
}

export function resolveField(
  fields: Record<string, ResolvedField>,
  entity: AgentEntity,
  field: string,
): ResolvedField {
  const spec = fields[field];
  if (!spec) {
    throw new Error(
      `Campo no permitido en ${entity}: ${field}. Usá list_writable_fields para ver los campos válidos.`,
    );
  }
  return spec;
}

// Coerces a raw (JSON) value into what Prisma expects for the field type,
// throwing a Spanish, model-readable error on invalid input. `personRef`
// values are returned as strings; the caller must still validate that the
// person exists and belongs to the company.
export function coerceFieldValue(
  spec: FieldSpec,
  field: string,
  value: unknown,
): string | number | boolean | Date | null {
  if (value == null || value === "") {
    if (spec.type === "boolean") return false;
    return null;
  }

  switch (spec.type) {
    case "string":
    case "text":
      return String(value);
    case "int": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error(`${field}: se esperaba un número entero`);
      }
      assertRange(spec, field, parsed);
      return parsed;
    }
    case "decimal": {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`${field}: se esperaba un número`);
      }
      assertRange(spec, field, parsed);
      // Prisma Decimal columns accept string input without float precision loss.
      return String(value);
    }
    case "boolean":
      return Boolean(value);
    case "date": {
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${field}: fecha inválida (usar formato ISO)`);
      }
      return parsed;
    }
    case "enum": {
      const candidate = String(value);
      if (!spec.enumValues?.includes(candidate)) {
        throw new Error(
          `${field}: valor inválido "${candidate}". Valores permitidos: ${spec.enumValues?.join(", ")}`,
        );
      }
      return candidate;
    }
    case "personRef":
      return String(value);
  }
}

function assertRange(spec: FieldSpec, field: string, value: number): void {
  if (spec.min != null && value < spec.min) {
    throw new Error(`${field}: mínimo ${spec.min}`);
  }
  if (spec.max != null && value > spec.max) {
    throw new Error(`${field}: máximo ${spec.max}`);
  }
}

// Compact human/model-readable digest for the list_writable_fields tool.
export async function describeFieldsForModel(
  entity: AgentEntity,
): Promise<string> {
  const fields = await getWritableFields(entity);
  return Object.entries(fields)
    .map(([name, spec]) => {
      const parts = [`${name} (${spec.type}) — ${spec.label}`];
      if (spec.enumValues?.length) {
        parts.push(`valores: ${spec.enumValues.join(" | ")}`);
      }
      if (spec.min != null || spec.max != null) {
        parts.push(`rango: ${spec.min ?? "-∞"}..${spec.max ?? "∞"}`);
      }
      if (spec.customDefinition) {
        parts.push("campo custom");
      }
      return parts.join(" · ");
    })
    .join("\n");
}
