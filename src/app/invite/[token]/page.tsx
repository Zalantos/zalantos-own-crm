import { notFound } from "next/navigation";
import { prismaSystem } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { AcceptInviteForm } from "./accept-invite-form";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invitation = await prismaSystem.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { name: true, brandName: true } } },
  });

  const isValid =
    !!invitation && !invitation.acceptedAt && invitation.expiresAt > new Date();

  if (!invitation) notFound();

  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">
            {invitation.organization.brandName ?? invitation.organization.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isValid
              ? `Completa tu registro (${invitation.email})`
              : "Esta invitación ya no es válida"}
          </p>
        </div>

        {isValid && (
          <AcceptInviteForm token={token} email={invitation.email} />
        )}
      </div>
    </div>
  );
}
