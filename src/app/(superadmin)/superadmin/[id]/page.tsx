import { notFound } from "next/navigation";
import { prismaSystem } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteAdminForm } from "./invite-admin-form";
import { ToggleOrgActiveForm } from "./toggle-org-active-form";

export default async function SuperadminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await prismaSystem.organization.findUnique({
    where: { id },
    include: {
      users: {
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, name: true, role: true, isActive: true },
      },
    },
  });
  if (!org) notFound();

  return (
    <div>
      <PageHeader
        title={org.name}
        description={`${org.slug} · ${org.currency} · ${org.timezone}`}
        actions={<ToggleOrgActiveForm orgId={org.id} isActive={org.isActive} />}
      />

      <div className="mb-8 max-w-lg">
        <InviteAdminForm orgId={org.id} />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <p className="font-medium">{user.name ?? user.email}</p>
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{user.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "success" : "destructive"}>
                    {user.isActive ? "Activo" : "Desactivado"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {org.users.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground text-center">
                  Todavía no tiene usuarios.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
