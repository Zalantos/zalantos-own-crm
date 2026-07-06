import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const meetingCreateSchema = z.object({
  companyId: z.string().min(1, "La empresa es obligatoria"),
  opportunityId: z.preprocess(emptyToUndefined, z.string().optional()),
  title: z.string().min(1, "El título es obligatorio"),
  meetingType: z.string().default("discovery"),
  meetingDate: z.coerce.date(),
  participants: z.preprocess(emptyToUndefined, z.string().optional()),
});

export const meetingUpdateSchema = meetingCreateSchema.partial().extend({
  id: z.string().min(1),
});

export const manualTranscriptSchema = z.object({
  meetingId: z.string().min(1),
  text: z.string().min(1, "El texto es obligatorio"),
});

export type MeetingCreateInput = z.infer<typeof meetingCreateSchema>;

type ParticipantEntry = { name: string; email?: string };

// "Ana Pérez, ana@x.com\nJuan (cliente)" → [{ name, email? }]
export function parseParticipants(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
      const email = emailMatch?.[0];
      const name = email ? line.replace(email, "").replace(/[,\s]+$/, "").trim() : line;
      return email ? { name, email } : { name };
    });
}

export function serializeParticipants(participants: unknown): string {
  if (!Array.isArray(participants)) return "";
  return participants
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const { name, email } = entry as ParticipantEntry;
      if (!name) return "";
      return email ? `${name}, ${email}` : name;
    })
    .filter(Boolean)
    .join("\n");
}
