import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  const [companies, people, opportunities] = query
    ? await Promise.all([
        prisma.company.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          take: 10,
        }),
        prisma.person.findMany({
          where: {
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
          take: 10,
        }),
        prisma.opportunity.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          include: { company: true },
          take: 10,
        }),
      ])
    : [[], [], []];

  const totalResults = companies.length + people.length + opportunities.length;

  return (
    <div>
      <PageHeader
        title={`Resultados para "${query ?? ""}"`}
        description={`${totalResults} resultado(s)`}
      />

      <div className="grid grid-cols-3 gap-6">
        <ResultGroup title="Empresas">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/companies/${company.id}`}
              className="hover:bg-muted/50 block rounded-md border p-2 text-sm"
            >
              {company.name}
            </Link>
          ))}
        </ResultGroup>

        <ResultGroup title="Personas">
          {people.map((person) => (
            <Link
              key={person.id}
              href={`/people/${person.id}`}
              className="hover:bg-muted/50 block rounded-md border p-2 text-sm"
            >
              {person.firstName} {person.lastName}
            </Link>
          ))}
        </ResultGroup>

        <ResultGroup title="Oportunidades">
          {opportunities.map((opportunity) => (
            <Link
              key={opportunity.id}
              href={`/opportunities/${opportunity.id}`}
              className="hover:bg-muted/50 block rounded-md border p-2 text-sm"
            >
              {opportunity.name}
              <span className="text-muted-foreground">
                {" "}
                · {opportunity.company.name}
              </span>
            </Link>
          ))}
        </ResultGroup>
      </div>
    </div>
  );
}

function ResultGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const items = children as React.ReactNode[];
  const isEmpty = Array.isArray(items) && items.length === 0;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        {title}
      </p>
      {isEmpty ? (
        <p className="text-muted-foreground text-sm">Sin resultados.</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}
