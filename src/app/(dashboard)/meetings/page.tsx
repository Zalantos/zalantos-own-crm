import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ProcessingStatusBadge } from "@/components/shared/meeting/processing-status-badge";
import { formatDate } from "@/lib/utils";

export default async function MeetingsPage() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { meetingDate: "desc" },
    include: {
      company: { select: { name: true } },
      _count: { select: { evidence: true, proposals: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Meeting Intelligence"
        description="Convierte la evidencia de cada reunión en conocimiento estructurado del CRM"
        actions={
          <Button render={<Link href="/meetings/new" />}>Nueva reunión</Button>
        }
      />

      {meetings.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no hay reuniones registradas.
        </p>
      ) : (
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="hover:bg-muted/50 flex items-center justify-between rounded-md border p-4 text-sm"
            >
              <div>
                <p className="font-medium">{meeting.title}</p>
                <p className="text-muted-foreground text-xs">
                  {meeting.company.name} · {formatDate(meeting.meetingDate)} ·{" "}
                  {meeting._count.evidence} evidencia(s) ·{" "}
                  {meeting._count.proposals} propuesta(s)
                </p>
              </div>
              <ProcessingStatusBadge status={meeting.processingStatus} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
