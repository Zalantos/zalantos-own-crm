import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/meeting-intelligence/storage/r2";
import {
  classifyEvidence,
  extractText,
} from "@/lib/meeting-intelligence/extraction";
import { transcribeAudio } from "@/lib/meeting-intelligence/transcription";
import { buildCrmSnapshot } from "@/lib/meeting-intelligence/ai/snapshot";
import { defaultReasoningProvider } from "@/lib/meeting-intelligence/ai/groq";
import {
  buildAiSummary,
  mapAnalysisToItems,
} from "@/lib/meeting-intelligence/ai/mapping";
import type { Prisma } from "@prisma/client";

// Orchestrates evidence → text → transcript → AI → proposal for one meeting.
// Each phase advances Meeting.processingStatus and is safe to re-run: evidence
// that already has extractedText is skipped, so a retry resumes where it left off.
export async function runPipeline(meetingId: string): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { evidence: true },
  });
  if (!meeting) throw new Error(`Meeting no encontrada: ${meetingId}`);

  try {
    // --- Extract text from documents ---
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { processingStatus: "extracting", processingError: null },
    });

    for (const ev of meeting.evidence) {
      if (ev.extractedText) continue;
      const { kind } = classifyEvidence(ev.filename, ev.mimeType);
      if (kind !== "text") continue;
      const buffer = await getObjectBuffer(ev.storagePath);
      const text = await extractText(ev.type, buffer);
      await prisma.evidence.update({
        where: { id: ev.id },
        data: { extractedText: text, status: "extracted" },
      });
    }

    // --- Transcribe audio/video ---
    let primaryTranscript = meeting.rawTranscript ?? "";
    for (const ev of meeting.evidence) {
      if (ev.extractedText) continue;
      const { kind } = classifyEvidence(ev.filename, ev.mimeType);
      if (kind !== "audio" && kind !== "video") continue;
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { processingStatus: "transcribing" },
      });
      const buffer = await getObjectBuffer(ev.storagePath);
      const transcript = await transcribeAudio(buffer, ev.filename);
      await prisma.evidence.update({
        where: { id: ev.id },
        data: { extractedText: transcript, status: "extracted" },
      });
      primaryTranscript = [primaryTranscript, transcript]
        .filter(Boolean)
        .join("\n\n");
    }

    // --- Assemble combined text for the model ---
    const refreshed = await prisma.evidence.findMany({
      where: { meetingId },
      orderBy: { uploadedAt: "asc" },
    });
    const combined = refreshed
      .filter((e) => e.extractedText)
      .map((e) => `# ${e.filename}\n${e.extractedText}`)
      .join("\n\n");

    if (!combined.trim()) {
      throw new Error("No se pudo extraer texto de ninguna evidencia.");
    }

    // --- AI reasoning ---
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: "analyzing",
        rawTranscript: primaryTranscript || combined,
      },
    });

    const snapshot = await buildCrmSnapshot(meetingId);
    const { analysis, model, raw } = await defaultReasoningProvider.analyze({
      snapshot,
      transcript: combined,
    });

    const items = mapAnalysisToItems(analysis, {
      companyId: meeting.companyId,
      opportunities: snapshot.opportunities.map((o) => ({
        id: o.id,
        stage: o.stage,
        nextStep: o.nextStep,
        nextStepDueDate: o.nextStepDueDate,
      })),
    });

    // --- Persist proposal + items ---
    await prisma.$transaction(async (tx) => {
      await tx.cRMChangeProposal.create({
        data: {
          meetingId,
          confidence: analysis.confidence,
          model,
          rawModelOutput: raw as unknown as Prisma.InputJsonValue,
          items: {
            create: items.map((item) => ({
              type: item.type,
              entity: item.entity,
              entityId: item.entityId,
              beforeValue: (item.beforeValue ??
                undefined) as Prisma.InputJsonValue,
              afterValue: (item.afterValue ??
                undefined) as Prisma.InputJsonValue,
              confidence: item.confidence,
              explanation: item.explanation,
            })),
          },
        },
      });

      await tx.meeting.update({
        where: { id: meetingId },
        data: {
          processingStatus: "ready",
          aiSummary: buildAiSummary(analysis) as unknown as Prisma.InputJsonValue,
        },
      });
    });
  } catch (error) {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: "failed",
        processingError:
          error instanceof Error ? error.message : "Error desconocido",
      },
    });
    throw error;
  }
}
