import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { DeleteRecordSection } from "@/components/shared/delete-record-section";
import { MeetingForm } from "../../meeting-form";
import { deleteMeeting } from "../../actions";

export default async function EditMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = await requireOrgContext();

  const [meeting, companies] = await Promise.all([
    db.meeting.findUnique({
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
    db.company.findMany({
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
      <div className="mt-8 max-w-2xl">
        <DeleteRecordSection
          title="Eliminar reunión"
          description={`Esta acción es irreversible. ${meeting.title} y su evidencia asociada se eliminarán.`}
          confirmMessage={`¿Eliminar la reunión ${meeting.title} y su evidencia? Esta acción no se puede deshacer.`}
          buttonLabel="Eliminar reunión"
          errorMessage="No se pudo eliminar la reunión. Intenta de nuevo."
          action={deleteMeeting.bind(null, meeting.id)}
        />
      </div>
    </div>
  );
}
