"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { forOrg, requireOrgContext } from "@/lib/tenant";
import { manualTranscriptSchema } from "@/lib/zod/meeting";
import { classifyEvidence } from "@/lib/meeting-intelligence/extraction";
import { runPipeline } from "@/lib/meeting-intelligence/pipeline";
import { appendTimelineEvent } from "@/lib/timeline";
import type { FormState } from "./types";

// Runs the pipeline after the response is sent (fast path). Failures are
// captured on the meeting row by runPipeline itself.
//
// This file (and everything it pulls in via pipeline.ts — AWS SDK, Groq SDK,
// mammoth, pdf-parse) is intentionally isolated from actions.ts / proposal-
// actions.ts so that lighter pages (e.g. /meetings/new) don't have to compile
// this weight just to reach createMeeting.
function schedulePipeline(organizationId: string, meetingId: string) {
  after(async () => {
    try {
      // El request ya terminó: se reconstruye un cliente scoped a la org.
      await runPipeline(forOrg(organizationId), organizationId, meetingId);
    } catch (error) {
      console.error(`[pipeline] meeting ${meetingId} falló`, error);
    }
  });
}

// Called by EvidenceUploader after the file is PUT to R2. Records the evidence
// and kicks off the pipeline.
export async function registerEvidence(input: {
  meetingId: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  sizeBytes?: number;
}) {
  const { user, org, db } = await requireOrgContext();
  const { type, kind } = classifyEvidence(input.filename, input.mimeType);

  await db.evidence.create({
    data: {
      organizationId: org.id,
      meetingId: input.meetingId,
      type,
      filename: input.filename,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      sizeBytes: input.sizeBytes ?? null,
      uploadedBy: user.id,
    },
  });

  const meeting = await db.meeting.update({
    where: { id: input.meetingId },
    data: {
      sourceType: kind === "audio" || kind === "video" ? kind : "manual",
      processingStatus: "pending",
    },
    select: { companyId: true, opportunityId: true, title: true },
  });

  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "evidence_uploaded",
    title: `Evidencia subida: ${input.filename}`,
    summary: `Reunión: ${meeting.title}`,
    refType: "meeting",
    refId: input.meetingId,
    actorId: user.id,
  });

  // Note: no pipeline trigger here. The uploader registers every file first,
  // then calls reprocessMeeting() once so a multi-file upload yields a single
  // proposal instead of one per file.
  revalidatePath(`/meetings/${input.meetingId}`);
}

export async function addManualTranscript(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org, db } = await requireOrgContext();
  const parsed = manualTranscriptSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      error: "Revisa el texto de la transcripción.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.evidence.create({
    data: {
      organizationId: org.id,
      meetingId: parsed.data.meetingId,
      type: "transcript",
      filename: "transcripcion-manual.txt",
      mimeType: "text/plain",
      storagePath: "",
      extractedText: parsed.data.text,
      status: "extracted",
      uploadedBy: user.id,
    },
  });

  const meeting = await db.meeting.update({
    where: { id: parsed.data.meetingId },
    data: { processingStatus: "pending" },
    select: { companyId: true, opportunityId: true, title: true },
  });

  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: meeting.companyId,
    opportunityId: meeting.opportunityId,
    type: "transcript_added",
    title: `Transcripción manual agregada`,
    summary: `Reunión: ${meeting.title}`,
    refType: "meeting",
    refId: parsed.data.meetingId,
    actorId: user.id,
  });

  schedulePipeline(org.id, parsed.data.meetingId);
  revalidatePath(`/meetings/${parsed.data.meetingId}`);
  return undefined;
}

export async function reprocessMeeting(meetingId: string) {
  const { org, db } = await requireOrgContext();
  await db.meeting.update({
    where: { id: meetingId },
    data: { processingStatus: "pending", processingError: null },
  });
  schedulePipeline(org.id, meetingId);
  revalidatePath(`/meetings/${meetingId}`);
}
