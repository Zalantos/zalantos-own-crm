import { requireOrgContext } from "@/lib/tenant";
import { NoteItem } from "@/components/shared/notes/note-item";
import { NoteCreateForm } from "@/components/shared/notes/note-create-form";

export async function NotesPanel({
  companyId,
  personId,
  opportunityId,
  commercialLeadId,
  commercialPartnerId,
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
  commercialLeadId?: string;
  commercialPartnerId?: string;
}) {
  const { db } = await requireOrgContext();
  const notes = await db.note.findMany({
    where: {
      companyId,
      personId,
      opportunityId,
      commercialLeadId,
      commercialPartnerId,
    },
    include: { createdBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <NoteCreateForm
        companyId={companyId}
        personId={personId}
        opportunityId={opportunityId}
        commercialLeadId={commercialLeadId}
        commercialPartnerId={commercialPartnerId}
      />
      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no hay notas.</p>
        ) : (
          notes.map((note) => <NoteItem key={note.id} note={note} />)
        )}
      </div>
    </div>
  );
}
