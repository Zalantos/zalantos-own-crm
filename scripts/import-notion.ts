// Importación única desde export CSV de Notion (julio 2026).
// Borra los datos CRM existentes (empresas, personas, oportunidades,
// actividades, notas, meetings y dependencias) y carga la data real.
// Conserva: usuarios, workflows, definiciones de campos custom y saved views.
// Ejecutar: npx tsx scripts/import-notion.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Mediodía UTC para que la fecha no se corra un día en horario de Chile.
function day(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

type CompanySeed = {
  key: string;
  name: string;
  industry: string;
  size?: string;
  country: string;
  status: string;
  contact?: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
};

// Excluidos del export: "Bleu Horizon Management" y su deal
// "Corporate Management Optimization" (data de ejemplo de la plantilla de Notion).
const companies: CompanySeed[] = [
  {
    key: "skava",
    name: "Skava",
    industry: "Consultoría / Minería",
    country: "Chile",
    status: "active",
    contact: { firstName: "Julio", lastName: "" },
  },
  {
    key: "cruz-verde",
    name: "Cruz Verde",
    industry: "Salud",
    size: "Mid-size",
    country: "Chile",
    status: "active",
    contact: {
      firstName: "George",
      lastName: "Yacoub",
      email: "george.yacoub@gmail.com",
      phone: "+56 9 5646 8155",
    },
  },
  {
    key: "apv",
    name: "APV Ventanas",
    industry: "Manufactura / Eficiencia operacional",
    country: "Chile",
    status: "active",
    contact: {
      firstName: "Matias",
      lastName: "Poncell",
      email: "Mponcell@apvventanas.cl",
      phone: "+56 9 5608 6453",
    },
  },
  {
    key: "vp-media",
    name: "VP Media",
    industry: "Marketing / Publicidad",
    country: "Perú",
    status: "active",
    contact: {
      firstName: "Valeria",
      lastName: "Villareal",
      email: "valeria@vpmediagroup.com.pe",
      phone: "+51 995 999 535",
    },
  },
  {
    key: "colegio",
    name: "Colegio San Francisco de Machalí",
    industry: "Educación",
    country: "Chile",
    status: "active",
    contact: {
      firstName: "Verónica",
      lastName: "Rodriguez",
      email: "veronica.rodriguez@zalantos.com",
      phone: "+56 9 5608 6453",
    },
  },
  {
    key: "zalantos",
    name: "Zalantos",
    industry: "Startup / Tecnología",
    country: "Chile",
    status: "active",
    contact: {
      firstName: "Tomas",
      lastName: "Rodriguez",
      email: "tomas.rodriguez@zalantos.com",
      phone: "+56981538112",
    },
  },
  {
    key: "polpaico",
    name: "Polpaico",
    industry: "Construcción",
    country: "Chile",
    status: "active",
    contact: {
      firstName: "Luciano",
      lastName: "Veas",
      email: "luciano.veas@polpaicosoluciones.cl",
    },
  },
  {
    key: "repopack",
    name: "Repopack",
    industry: "Estrategia comercial / Consultoría TI",
    country: "Chile",
    status: "active",
    contact: {
      firstName: "Raimundo",
      lastName: "Velazquez",
      email: "rvelasquez@repopack.cl",
      phone: "+56 9 3217 5504",
    },
  },
  {
    key: "urbanland",
    name: "Urbanland",
    industry: "Inmobiliaria",
    country: "Chile",
    status: "active",
    contact: {
      firstName: "Juan Pablo",
      lastName: "Humenyi",
      email: "juanpablo@urbanland.cl",
      phone: "+56 9 7397 6443",
    },
  },
];

type OpportunitySeed = {
  key: string;
  companyKey: string;
  name: string;
  stage:
    | "lead_identificado"
    | "reunion_discovery"
    | "propuesta_principal"
    | "negociacion"
    | "ganado"
    | "perdido";
  status: "open" | "won" | "lost";
  probability: number;
  estimatedValue?: number;
  montoRecurrente?: number;
  expectedCloseDate?: string;
};

const opportunities: OpportunitySeed[] = [
  {
    key: "skava-forecast",
    companyKey: "skava",
    name: "Forecast de Venta de Repuestos Mineros y Dashboard Estratégico",
    stage: "negociacion",
    status: "open",
    probability: 70,
    estimatedValue: 6990000,
    montoRecurrente: 690000,
    expectedCloseDate: "2025-12-31",
  },
  {
    key: "cruzverde-inventario",
    companyKey: "cruz-verde",
    name: "Inventariado paralelo en una Plataforma Web",
    stage: "perdido",
    status: "lost",
    probability: 0,
    estimatedValue: 0,
    expectedCloseDate: "2025-12-31",
  },
  {
    key: "colegio-rag",
    companyKey: "colegio",
    name: "Agente RAG para reglamento",
    stage: "ganado",
    status: "won",
    probability: 100,
    estimatedValue: 0,
    expectedCloseDate: "2025-12-31",
  },
  {
    key: "apv-erp",
    companyKey: "apv",
    name: "ERP para Empresa Manufacturera de Ventanas",
    stage: "negociacion",
    status: "open",
    probability: 70,
    estimatedValue: 16000000,
    montoRecurrente: 600000,
  },
  {
    key: "vpmedia-prhub",
    companyKey: "vp-media",
    name: "PR HUB",
    stage: "lead_identificado",
    status: "open",
    probability: 10,
  },
  {
    key: "polpaico-desarrollo",
    companyKey: "polpaico",
    name: "Todavía en Desarrollo",
    stage: "lead_identificado",
    status: "open",
    probability: 10,
  },
  {
    key: "repopack-consultoria",
    companyKey: "repopack",
    name: "Consultoria Comercial y de TI",
    stage: "propuesta_principal",
    status: "open",
    probability: 50,
    estimatedValue: 500000,
  },
  {
    key: "urbanland-bi",
    companyKey: "urbanland",
    name: "BI para Urbanland",
    stage: "reunion_discovery",
    status: "open",
    probability: 30,
    estimatedValue: 5000000,
    montoRecurrente: 500000,
  },
];

type ActivitySeed = {
  title: string;
  type: "meeting" | "call" | "task" | "follow_up";
  date?: string;
  opportunityKey?: string;
  companyKey?: string;
  outcome?: string;
  followUp: boolean;
  done: boolean;
};

const activities: ActivitySeed[] = [
  {
    title: "Mandar la propuesta",
    type: "task",
    date: "2025-12-17",
    opportunityKey: "skava-forecast",
    outcome: "El cliente revisa la propuesta y la aprueba",
    followUp: true,
    done: true,
  },
  {
    title: "Tener reunion para entender los dolores",
    type: "meeting",
    date: "2025-12-17",
    opportunityKey: "apv-erp",
    outcome: "Claridad de los dolores y avance en la propuesta",
    followUp: true,
    done: true,
  },
  {
    title: "Recibir la data y enviar propuesta",
    type: "task",
    date: "2025-12-19",
    opportunityKey: "cruzverde-inventario",
    outcome: "Aceptación de la propuesta",
    followUp: true,
    done: true,
  },
  {
    title: "Agendar levantamiento de procesos",
    type: "task",
    date: "2025-12-18",
    opportunityKey: "apv-erp",
    followUp: true,
    done: true,
  },
  {
    title: "Hacer el levantamiento de los procesos",
    type: "task",
    opportunityKey: "apv-erp",
    outcome: "Tener la claridad sobre como son los procesos dentro de la empresa",
    followUp: true,
    done: true,
  },
  {
    title: "Analizar propuesta",
    type: "task",
    date: "2026-01-12",
    opportunityKey: "apv-erp",
    outcome: "Mandar propuesta",
    followUp: true,
    done: true,
  },
  {
    title: "Mandar mail de explicacion de propuesta",
    type: "task",
    followUp: false,
    done: false,
  },
  {
    title:
      "Reunión con Matias para alinear expectativas y responder dudas sobre el levantamiento de procesos",
    type: "meeting",
    date: "2026-02-06",
    opportunityKey: "apv-erp",
    outcome:
      "Check para poder hacer la cotización a fondo. Organizar una reunión para poder cerrar",
    followUp: true,
    done: true,
  },
  {
    title: "Primero Contacto",
    type: "meeting",
    date: "2026-04-11",
    opportunityKey: "polpaico-desarrollo",
    outcome: "Prioridades de problemas a resolver",
    followUp: true,
    done: true,
  },
  {
    title:
      "Reunión presencial donde se ven aspectos detallados de la solución. Se adjunta detalle de la reunión",
    type: "meeting",
    date: "2026-04-10",
    opportunityKey: "apv-erp",
    outcome: "Mejorar la propuesta. Avanzar.",
    followUp: false,
    done: true,
  },
  {
    title: "Reunion con Oficina Técnica",
    type: "meeting",
    date: "2026-04-23",
    opportunityKey: "apv-erp",
    followUp: false,
    done: true,
  },
  {
    title: "Levantamiento de procesos con Polpaico",
    type: "meeting",
    date: "2026-04-28",
    opportunityKey: "polpaico-desarrollo",
    followUp: true,
    done: true,
  },
  {
    title: "Ultima reunión pre propuesta con Matias para aclarar ciertas dudas",
    type: "meeting",
    date: "2026-04-30",
    opportunityKey: "apv-erp",
    followUp: false,
    done: true,
  },
  {
    title: "Reunion 1 con RepoPack",
    type: "meeting",
    date: "2026-04-29",
    companyKey: "repopack",
    followUp: false,
    done: true,
  },
  {
    title: "Minuta reunion Nati 1",
    type: "meeting",
    date: "2026-05-08",
    followUp: true,
    done: true,
  },
  {
    title: "Reunión con Preference y APV 1",
    type: "meeting",
    date: "2026-05-13",
    opportunityKey: "apv-erp",
    outcome:
      "Ya se entiende como se disponibiliza la data, ahora queda ver como obtenerla",
    followUp: false,
    done: true,
  },
  {
    title: "Primera Reunion con Urbaland",
    type: "meeting",
    date: "2026-06-16",
    opportunityKey: "urbanland-bi",
    outcome: "Documento con todas las funcionalidades",
    followUp: true,
    done: true,
  },
  {
    title: "Reu 2 Urbanland",
    type: "meeting",
    companyKey: "urbanland",
    followUp: false,
    done: false,
  },
];

async function wipeCrmData() {
  const counts = {
    companies: await prisma.company.count(),
    people: await prisma.person.count(),
    opportunities: await prisma.opportunity.count(),
    activities: await prisma.activity.count(),
    notes: await prisma.note.count(),
    meetings: await prisma.meeting.count(),
  };
  console.log("[wipe] Registros existentes antes de borrar:", counts);

  await prisma.$transaction([
    prisma.workflowLog.deleteMany(),
    prisma.customFieldValue.deleteMany(),
    prisma.timelineEvent.deleteMany(),
    prisma.cRMChangeItem.deleteMany(),
    prisma.cRMChangeProposal.deleteMany(),
    prisma.evidence.deleteMany(),
    prisma.meeting.deleteMany(),
    prisma.note.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.person.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  console.log("[wipe] Datos CRM borrados (usuarios y workflows intactos).");
}

async function main() {
  // El CRM ahora es multi-tenant: este import histórico siempre corrió (y
  // sigue corriendo) contra la organización Zalantos.
  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: "zalantos" },
  });
  const organizationId = org.id;
  const stages = await prisma.pipelineStage.findMany({
    where: { organizationId },
  });
  const stageIdByKey = new Map(stages.map((stage) => [stage.key, stage.id]));
  const stageId = (key: string) => {
    const id = stageIdByKey.get(key);
    if (!id) throw new Error(`Etapa desconocida en import: ${key}`);
    return id;
  };

  await wipeCrmData();

  const companyIds = new Map<string, string>();
  const contactIds = new Map<string, string>();

  for (const seed of companies) {
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: seed.name,
        industry: seed.industry,
        size: seed.size,
        country: seed.country,
        status: seed.status,
      },
    });
    companyIds.set(seed.key, company.id);

    if (seed.contact) {
      const person = await prisma.person.create({
        data: {
          organizationId,
          companyId: company.id,
          firstName: seed.contact.firstName,
          lastName: seed.contact.lastName,
          email: seed.contact.email,
          phone: seed.contact.phone,
          isDecisionMaker: true,
        },
      });
      contactIds.set(seed.key, person.id);
    }
  }
  console.log(`[import] ${companyIds.size} empresas + contactos creados.`);

  // Campo custom para el monto recurrente mensual que Notion traía aparte.
  const montoRecurrenteDef = await prisma.customFieldDefinition.upsert({
    where: {
      organizationId_entityType_fieldName: {
        organizationId,
        entityType: "opportunity",
        fieldName: "montoRecurrente",
      },
    },
    update: {},
    create: {
      organizationId,
      entityType: "opportunity",
      fieldName: "montoRecurrente",
      fieldLabel: "Monto recurrente (CLP/mes)",
      fieldType: "number",
    },
  });

  const opportunityIds = new Map<string, string>();
  for (const seed of opportunities) {
    const companyId = companyIds.get(seed.companyKey)!;
    const opportunity = await prisma.opportunity.create({
      data: {
        organizationId,
        companyId,
        name: seed.name,
        stageId: stageId(seed.stage),
        status: seed.status,
        probability: seed.probability,
        estimatedValue: seed.estimatedValue,
        source: "referido",
        decisionMakerId: contactIds.get(seed.companyKey),
        expectedCloseDate: seed.expectedCloseDate
          ? day(seed.expectedCloseDate)
          : undefined,
      },
    });
    opportunityIds.set(seed.key, opportunity.id);

    if (seed.montoRecurrente !== undefined) {
      await prisma.customFieldValue.create({
        data: {
          organizationId,
          entityType: "opportunity",
          entityId: opportunity.id,
          fieldDefinitionId: montoRecurrenteDef.id,
          valueNumber: seed.montoRecurrente,
        },
      });
    }
  }
  console.log(`[import] ${opportunityIds.size} oportunidades creadas.`);

  for (const seed of activities) {
    const opportunitySeed = opportunities.find(
      (opportunity) => opportunity.key === seed.opportunityKey,
    );
    const opportunityId = seed.opportunityKey
      ? opportunityIds.get(seed.opportunityKey)
      : undefined;
    const companyId = seed.companyKey
      ? companyIds.get(seed.companyKey)
      : opportunitySeed
        ? companyIds.get(opportunitySeed.companyKey)
        : undefined;

    const descriptionParts = [];
    if (seed.outcome) descriptionParts.push(`Resultado: ${seed.outcome}`);
    if (seed.followUp) descriptionParts.push("Requiere seguimiento.");

    await prisma.activity.create({
      data: {
        organizationId,
        companyId,
        opportunityId,
        type: seed.type,
        title: seed.title,
        description: descriptionParts.join("\n") || undefined,
        dueDate: seed.date ? day(seed.date) : undefined,
        status: seed.done ? "completed" : "pending",
        completedAt: seed.done && seed.date ? day(seed.date) : undefined,
      },
    });
  }
  console.log(`[import] ${activities.length} actividades creadas.`);

  console.log("[import] Resumen final:", {
    companies: await prisma.company.count(),
    people: await prisma.person.count(),
    opportunities: await prisma.opportunity.count(),
    activities: await prisma.activity.count(),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
