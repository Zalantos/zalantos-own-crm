import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamMemberCreateForm } from "./team-member-create-form";
import {
  EnsureCurrentAdminTeamMemberForm,
  TeamMemberActiveForm,
  TeamMemberDeleteForm,
  TeamMemberLinkForm,
} from "./team-member-row-actions";

export default async function TeamAdminPage() {
  const currentUser = await requireAdmin();

  const [teamMembers, availableUsers, currentAdminTeamMember] =
    await Promise.all([
      prisma.teamMember.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        include: { user: { select: { name: true, email: true } } },
      }),
      // Usuarios activos que todavía no tienen persona del equipo vinculada.
      prisma.user.findMany({
        where: { isActive: true, teamMember: null },
        select: { id: true, name: true, email: true },
        orderBy: { email: "asc" },
      }),
      prisma.teamMember.findUnique({
        where: { userId: currentUser.id },
        select: { isActive: true },
      }),
    ]);

  const currentAdminIsAssignable = currentAdminTeamMember?.isActive ?? false;

  return (
    <div>
      <PageHeader
        title="Equipo"
        description="Define las personas disponibles para asignarles tareas, tengan o no usuario en el CRM"
      />

      {!currentAdminIsAssignable && (
        <Alert className="mb-6 max-w-4xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <AlertTitle>No apareces como responsable asignable</AlertTitle>
              <AlertDescription>
                Tu cuenta admin necesita estar vinculada a una persona activa
                del equipo para poder recibir tareas y usar el filtro Mis
                tareas.
              </AlertDescription>
            </div>
            <EnsureCurrentAdminTeamMemberForm />
          </div>
        </Alert>
      )}

      <div className="mb-8 max-w-4xl">
        <TeamMemberCreateForm availableUsers={availableUsers} />
      </div>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[420px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Todavía no hay personas en el equipo.
                </TableCell>
              </TableRow>
            ) : (
              teamMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {member.email ?? member.user?.email ?? "—"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {member.userId ? "Usuario Zalantos" : "Externo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.isActive ? "success" : "destructive"}>
                      {member.isActive ? "Activo" : "Desactivado"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-3">
                      <TeamMemberLinkForm
                        id={member.id}
                        userId={member.userId}
                        linkedUserLabel={
                          member.user
                            ? (member.user.name ?? member.user.email)
                            : null
                        }
                        availableUsers={availableUsers}
                      />
                      <div className="flex items-center gap-2">
                        <TeamMemberActiveForm
                          id={member.id}
                          isActive={member.isActive}
                        />
                        <TeamMemberDeleteForm id={member.id} />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {teamMembers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay personas en el equipo.
          </p>
        ) : (
          teamMembers.map((member) => (
            <div key={member.id} className="space-y-3 rounded-md border p-4">
              <div>
                <p className="font-medium">{member.name}</p>
                <p className="text-muted-foreground text-xs">
                  {member.email ?? member.user?.email ?? "—"}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Tipo</span>
                <Badge variant="outline">
                  {member.userId ? "Usuario Zalantos" : "Externo"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Estado</span>
                <Badge variant={member.isActive ? "success" : "destructive"}>
                  {member.isActive ? "Activo" : "Desactivado"}
                </Badge>
              </div>
              <div className="flex flex-col gap-3 border-t pt-3">
                <TeamMemberLinkForm
                  id={member.id}
                  userId={member.userId}
                  linkedUserLabel={
                    member.user ? (member.user.name ?? member.user.email) : null
                  }
                  availableUsers={availableUsers}
                />
                <div className="flex items-center gap-2">
                  <TeamMemberActiveForm
                    id={member.id}
                    isActive={member.isActive}
                  />
                  <TeamMemberDeleteForm id={member.id} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
