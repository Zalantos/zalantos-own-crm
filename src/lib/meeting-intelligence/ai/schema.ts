import { z } from "zod";

// Strict-but-tolerant contract for the model's JSON. Fields are optional with
// defaults so a partially-formed (but valid-JSON) response still parses; the
// repair-retry in groq.ts handles outright invalid JSON.

const confidence = z.coerce.number().min(0).max(1).optional().default(0.6);
const explanation = z.string().optional().default("");

const summarySchema = z
  .object({
    headline: z.string().optional().default(""),
    key_points: z.array(z.string()).optional().default([]),
  })
  .optional()
  .default({ headline: "", key_points: [] });

const updateSchema = z.object({
  entity: z.enum(["company", "opportunity", "person"]),
  entity_id: z.string().nullable().optional(),
  field: z.string(),
  current_value: z.unknown().optional(),
  new_value: z.unknown(),
  confidence,
  explanation,
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
});

const taskSchema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  due_in_days: z.number().nullable().optional(),
  confidence,
  explanation,
});

const noteSchema = z.object({
  title: z.string().nullable().optional(),
  body: z.string(),
  confidence,
  explanation,
});

const stageChangeSchema = z
  .object({
    opportunity_id: z.string().nullable().optional(),
    from_stage: z.string().nullable().optional(),
    to_stage: z.string(),
    confidence,
    explanation,
  })
  .nullable()
  .optional();

const painUpdateSchema = z.object({
  opportunity_id: z.string().nullable().optional(),
  pain: z.string(),
  confidence,
  explanation,
});

// The prompt demands one of these after every meeting; the schema stays
// tolerant so a missing next_step_update doesn't fail the whole parse.
const nextStepUpdateSchema = z
  .object({
    opportunity_id: z.string().nullable().optional(),
    next_step: z.string(),
    due_date: z.string().nullable().optional(),
    confidence,
    explanation,
  })
  .nullable()
  .optional();

export const crmAnalysisSchema = z.object({
  summary: summarySchema,
  updates: z.array(updateSchema).optional().default([]),
  new_contacts: z.array(contactSchema).optional().default([]),
  tasks: z.array(taskSchema).optional().default([]),
  notes: z.array(noteSchema).optional().default([]),
  stage_change: stageChangeSchema,
  pain_updates: z.array(painUpdateSchema).optional().default([]),
  next_step_update: nextStepUpdateSchema,
  risks: z.array(z.string()).optional().default([]),
  decisions: z.array(z.string()).optional().default([]),
  next_steps: z.array(taskSchema).optional().default([]),
  confidence: z.coerce.number().min(0).max(1).optional().default(0.5),
});

export type CrmAnalysis = z.infer<typeof crmAnalysisSchema>;
