import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { MeetingForm } from "../meeting-form";

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;

  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      opportunities: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true },
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="Nueva reunión"
        description="Registrá la reunión y luego subí la evidencia para procesarla"
      />
      {companies.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Primero necesitás crear al menos una empresa.
        </p>
      ) : (
        <MeetingForm companies={companies} defaultCompanyId={companyId} />
      )}
    </div>
  );
}
