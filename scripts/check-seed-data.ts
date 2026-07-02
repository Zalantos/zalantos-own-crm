import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function countSeedRecords() {
  const seedCompanies = await prisma.company.findMany({
    where: { id: { startsWith: "seed-" } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  const seedCompanyIds = seedCompanies.map((company) => company.id);

  const seedPeople = await prisma.person.findMany({
    where: {
      OR: [
        { id: { startsWith: "seed-" } },
        { companyId: { in: seedCompanyIds } },
      ],
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { id: "asc" },
  });

  const seedOpportunities = await prisma.opportunity.findMany({
    where: {
      OR: [
        { id: { startsWith: "seed-" } },
        { companyId: { in: seedCompanyIds } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  const seedOpportunityIds = seedOpportunities.map(
    (opportunity) => opportunity.id,
  );

  const [
    activities,
    notes,
    meetings,
    customFieldValues,
    timelineEvents,
    workflowLogs,
  ] = await Promise.all([
    prisma.activity.count({
      where: {
        OR: [
          { id: { startsWith: "seed-" } },
          { companyId: { in: seedCompanyIds } },
          { opportunityId: { in: seedOpportunityIds } },
        ],
      },
    }),
    prisma.note.count({
      where: {
        OR: [
          { id: { startsWith: "seed-" } },
          { companyId: { in: seedCompanyIds } },
          { opportunityId: { in: seedOpportunityIds } },
        ],
      },
    }),
    prisma.meeting.count({
      where: {
        OR: [
          { id: { startsWith: "seed-" } },
          { companyId: { in: seedCompanyIds } },
          { opportunityId: { in: seedOpportunityIds } },
        ],
      },
    }),
    prisma.customFieldValue.count({
      where: {
        OR: [
          { entityId: { startsWith: "seed-" } },
          { entityId: { in: [...seedCompanyIds, ...seedOpportunityIds] } },
        ],
      },
    }),
    prisma.timelineEvent.count({
      where: {
        OR: [
          { id: { startsWith: "seed-" } },
          { companyId: { in: seedCompanyIds } },
          { opportunityId: { in: seedOpportunityIds } },
        ],
      },
    }),
    prisma.workflowLog.count({
      where: {
        OR: [
          { id: { startsWith: "seed-" } },
          { entityId: { startsWith: "seed-" } },
          { entityId: { in: [...seedCompanyIds, ...seedOpportunityIds] } },
        ],
      },
    }),
  ]);

  return {
    companies: seedCompanies,
    people: seedPeople,
    opportunities: seedOpportunities,
    relatedCounts: {
      activities,
      notes,
      meetings,
      customFieldValues,
      timelineEvents,
      workflowLogs,
    },
  };
}

async function main() {
  const report = await countSeedRecords();
  const total =
    report.companies.length +
    report.people.length +
    report.opportunities.length +
    Object.values(report.relatedCounts).reduce((sum, count) => sum + count, 0);

  console.log("Seed data report");
  console.log("================");
  console.log(`Total probable seed/demo records: ${total}`);
  console.log("");
  console.log(`Companies: ${report.companies.length}`);
  for (const company of report.companies) {
    console.log(`- ${company.id}: ${company.name}`);
  }
  console.log("");
  console.log(`People: ${report.people.length}`);
  for (const person of report.people) {
    console.log(`- ${person.id}: ${person.firstName} ${person.lastName}`);
  }
  console.log("");
  console.log(`Opportunities: ${report.opportunities.length}`);
  for (const opportunity of report.opportunities) {
    console.log(`- ${opportunity.id}: ${opportunity.name}`);
  }
  console.log("");
  console.log("Related counts:");
  for (const [label, count] of Object.entries(report.relatedCounts)) {
    console.log(`- ${label}: ${count}`);
  }

  if (total > 0) {
    console.log("");
    console.log(
      "This script is read-only. Review these records before deleting demo data.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
