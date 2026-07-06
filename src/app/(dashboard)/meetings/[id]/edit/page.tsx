import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { MeetingForm } from "../../meeting-form";

export default async function EditMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [meeting, companies] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        opportunityId: true,
        title: true,
        meetingType: true,
        meetingDate: true,
        participants: true,
      },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        opportunities: {
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  if (!meeting) notFound();

  return (
    <div>
      <PageHeader
        title={`Editar ${meeting.title}`}
        description="Actualizá los datos de la reunión"
      />
      <MeetingForm companies={companies} meeting={meeting} />
    </div>
  );
}
