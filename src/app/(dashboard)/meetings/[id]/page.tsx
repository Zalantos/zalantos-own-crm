import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProcessingStatusBadge } from "@/components/shared/meeting/processing-status-badge";
import { EvidenceUploader } from "@/components/shared/meeting/evidence-uploader";
import { ManualTranscriptForm } from "@/components/shared/meeting/manual-transcript-form";
import { MeetingActions } from "@/components/shared/meeting/meeting-actions";
import {
  ChangeProposalReview,
  type ReviewProposal,
} from "@/components/shared/meeting/change-proposal-review";
import { CompanyTimeline } from "@/components/shared/timeline/company-timeline";
import { formatDateTime } from "@/lib/utils";

type AiSummary = {
  headline?: string;
  keyPoints?: string[];
  risks?: string[];
  decisions?: string[];
};

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      evidence: { orderBy: { uploadedAt: "asc" } },
      proposals: {
        orderBy: { createdAt: "desc" },
        include: { items: true },
      },
    },
  });
  if (!meeting) notFound();

  const summary = (meeting.aiSummary as AiSummary | null) ?? null;

  const proposals: ReviewProposal[] = meeting.proposals.map((p) => ({
    id: p.id,
    status: p.status,
    confidence: p.confidence,
    createdAt: p.createdAt.toISOString(),
    items: p.items.map((item) => ({
      id: item.id,
      type: item.type,
      entity: item.entity,
      beforeValue: item.beforeValue,
      afterValue: item.afterValue,
      confidence: item.confidence,
      explanation: item.explanation,
      approved: item.approved,
      status: item.status,
    })),
  }));

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description={`${meeting.company.name} · ${formatDateTime(meeting.meetingDate)} · ${meeting.meetingType}`}
        actions={
          <>
            <ProcessingStatusBadge status={meeting.processingStatus} />
            <MeetingActions meetingId={meeting.id} />
          </>
        }
      />

      {meeting.processingStatus === "failed" && meeting.processingError && (
        <p className="text-destructive mb-4 rounded-md border border-destructive/30 p-3 text-sm">
          {meeting.processingError}
        </p>
      )}

      <Tabs defaultValue="evidence">
        <TabsList>
          <TabsTrigger value="evidence">
            Evidencia ({meeting.evidence.length})
          </TabsTrigger>
          <TabsTrigger value="transcript">Transcripción</TabsTrigger>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="proposals">
            Propuestas ({meeting.proposals.length})
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="evidence" className="space-y-4 pt-4">
          <EvidenceUploader meetingId={meeting.id} />
          <div className="space-y-2">
            <p className="text-sm font-medium">O pegá una transcripción manual</p>
            <ManualTranscriptForm meetingId={meeting.id} />
          </div>
          <div className="space-y-2">
            {meeting.evidence.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span>{ev.filename}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{ev.type}</Badge>
                  <Badge variant="secondary">{ev.status}</Badge>
                </span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="transcript" className="space-y-4 pt-4">
          {meeting.rawTranscript ? (
            <pre className="bg-muted/30 max-h-[500px] overflow-auto rounded-md border p-4 text-sm whitespace-pre-wrap">
              {meeting.rawTranscript}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm">
              Todavía no hay transcripción.
            </p>
          )}
        </TabsContent>

        <TabsContent value="summary" className="space-y-3 pt-4">
          {summary ? (
            <div className="space-y-3 text-sm">
              {summary.headline && (
                <p className="font-medium">{summary.headline}</p>
              )}
              {summary.keyPoints && summary.keyPoints.length > 0 && (
                <SummaryList title="Puntos clave" items={summary.keyPoints} />
              )}
              {summary.decisions && summary.decisions.length > 0 && (
                <SummaryList title="Decisiones" items={summary.decisions} />
              )}
              {summary.risks && summary.risks.length > 0 && (
                <SummaryList title="Riesgos" items={summary.risks} />
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Todavía no hay resumen de IA.
            </p>
          )}
        </TabsContent>

        <TabsContent value="proposals" className="space-y-4 pt-4">
          {proposals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay propuestas. Subí evidencia para generarlas.
            </p>
          ) : (
            proposals.map((proposal) => (
              <ChangeProposalReview
                key={proposal.id}
                proposal={proposal}
                meetingId={meeting.id}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <CompanyTimeline companyId={meeting.company.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium uppercase">
        {title}
      </p>
      <ul className="list-inside list-disc">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
