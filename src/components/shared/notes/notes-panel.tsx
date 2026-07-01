import { prisma } from "@/lib/prisma";
import { NoteItem } from "@/components/shared/notes/note-item";
import { NoteCreateForm } from "@/components/shared/notes/note-create-form";

export async function NotesPanel({
  companyId,
  personId,
  opportunityId,
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
}) {
  const notes = await prisma.note.findMany({
    where: { companyId, personId, opportunityId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <NoteCreateForm
        companyId={companyId}
        personId={personId}
        opportunityId={opportunityId}
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
