import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { ProcessingStatusBadge } from "@/components/shared/meeting/processing-status-badge";
import { formatDate } from "@/lib/utils";
import type { Company, Meeting } from "@prisma/client";

type MeetingRow = Meeting & {
  company: Pick<Company, "name">;
  _count: { evidence: number; proposals: number };
};

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

      <DataTable<MeetingRow>
        rows={meetings}
        rowHref={(row) => `/meetings/${row.id}`}
        emptyMessage="Todavía no hay reuniones registradas."
        columns={[
          { header: "Título", cell: (row) => row.title },
          { header: "Empresa", cell: (row) => row.company.name },
          { header: "Fecha", cell: (row) => formatDate(row.meetingDate) },
          {
            header: "Evidencia",
            cell: (row) => row._count.evidence,
          },
          {
            header: "Propuestas",
            cell: (row) => row._count.proposals,
          },
          {
            header: "Estado",
            cell: (row) => (
              <ProcessingStatusBadge status={row.processingStatus} />
            ),
          },
        ]}
      />
    </div>
  );
}
