import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
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
import { UserCreateForm } from "./user-create-form";
import {
  UserActiveForm,
  UserResetPasswordForm,
  UserRoleForm,
} from "./user-row-actions";

export default async function UsersAdminPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Crea usuarios, gestiona roles, bloquea accesos y cambia contraseñas"
      />

      <div className="mb-8 max-w-3xl">
        <UserCreateForm />
      </div>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[360px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{user.name ?? user.email}</p>
                    <p className="text-muted-foreground text-xs">
                      {user.email}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{user.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "success" : "destructive"}>
                    {user.isActive ? "Activo" : "Desactivado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Intl.DateTimeFormat("es-CL", {
                    dateStyle: "medium",
                  }).format(user.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-3">
                    <UserRoleForm id={user.id} role={user.role} />
                    <UserActiveForm id={user.id} isActive={user.isActive} />
                    <UserResetPasswordForm id={user.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {users.map((user) => (
          <div key={user.id} className="space-y-3 rounded-md border p-4">
            <div>
              <p className="font-medium">{user.name ?? user.email}</p>
              <p className="text-muted-foreground text-xs">{user.email}</p>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Rol</span>
              <Badge variant="outline">{user.role}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Estado</span>
              <Badge variant={user.isActive ? "success" : "destructive"}>
                {user.isActive ? "Activo" : "Desactivado"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Creado</span>
              <span>
                {new Intl.DateTimeFormat("es-CL", {
                  dateStyle: "medium",
                }).format(user.createdAt)}
              </span>
            </div>
            <div className="flex flex-col gap-3 border-t pt-3">
              <UserRoleForm id={user.id} role={user.role} />
              <UserActiveForm id={user.id} isActive={user.isActive} />
              <UserResetPasswordForm id={user.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
