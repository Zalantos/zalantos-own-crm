import { z } from "zod";

const confidence = z.coerce.number().min(0).max(1).optional().default(0.6);
const explanation = z.string().optional().default("");
const evidence = z.string().optional().default("");

const keyFactSchema = z.object({
  label: z.string(),
  value: z.string(),
  confidence: confidence.optional(),
});

const fieldUpdateSchema = z.object({
  entity: z.enum(["company", "opportunity", "person"]),
  entity_id: z.string().nullable().optional(),
  field: z.string(),
  current_value: z.unknown().optional(),
  new_value: z.unknown(),
  confidence,
  explanation,
  evidence,
});

const contactSchema = z.object({
  first_name: z.string(),
  last_name: z.string().optional().default(""),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  role_title: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_decision_maker: z.boolean().optional().default(false),
  is_sponsor: z.boolean().optional().default(false),
  confidence,
  explanation,
  evidence,
});

export const entityContextAnalysisSchema = z.object({
  summary: z.string().optional().default(""),
  key_facts: z.array(keyFactSchema).optional().default([]),
  topics: z.array(z.string()).optional().default([]),
  context_note: z
    .object({
      title: z.string().nullable().optional(),
      body: z.string(),
    })
    .nullable()
    .optional(),
  field_updates: z.array(fieldUpdateSchema).optional().default([]),
  new_contacts: z.array(contactSchema).optional().default([]),
  confidence: z.coerce.number().min(0).max(1).optional().default(0.5),
});

export type EntityContextAnalysis = z.infer<typeof entityContextAnalysisSchema>;
