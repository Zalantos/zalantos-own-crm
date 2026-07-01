import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function seedAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      "[seed] ADMIN_EMAIL / ADMIN_PASSWORD no están definidas: se omite la creación del usuario admin.",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN" },
    create: {
      email,
      passwordHash,
      name: "Admin",
      role: "ADMIN",
    },
  });
  console.log(`[seed] Usuario admin listo: ${email}`);
}

async function main() {
  // ---------- Admin user ----------
  await seedAdminUser();

  // ---------- Companies ----------
  const apv = await prisma.company.upsert({
    where: { id: "seed-company-apv" },
    update: {},
    create: {
      id: "seed-company-apv",
      name: "APV Ventanas",
      website: "https://apvventanas.cl",
      industry: "Manufactura / Construcción",
      size: "51-200",
      country: "Chile",
      city: "Santiago",
      linkedinUrl: "https://linkedin.com/company/apv-ventanas",
      description:
        "Fabricante de ventanas de PVC y aluminio para proyectos residenciales e inmobiliarios en Chile.",
      icpScore: 82,
      fitScore: 78,
      painScore: 74,
      status: "active",
    },
  });

  const polpaico = await prisma.company.upsert({
    where: { id: "seed-company-polpaico" },
    update: {},
    create: {
      id: "seed-company-polpaico",
      name: "Polpaico",
      website: "https://polpaico.cl",
      industry: "Materiales de construcción / Cemento",
      size: "201-500",
      country: "Chile",
      city: "Santiago",
      linkedinUrl: "https://linkedin.com/company/polpaico",
      description:
        "Productor de cemento y materiales de construcción con operaciones a nivel nacional.",
      icpScore: 88,
      fitScore: 85,
      painScore: 80,
      status: "active",
    },
  });

  const repopack = await prisma.company.upsert({
    where: { id: "seed-company-repopack" },
    update: {},
    create: {
      id: "seed-company-repopack",
      name: "Repopack / Temática Chile",
      website: "https://repopack.cl",
      industry: "Empaques / Retail",
      size: "11-50",
      country: "Chile",
      city: "Santiago",
      linkedinUrl: "https://linkedin.com/company/repopack",
      description:
        "Distribuidor de empaques y artículos temáticos para retail y eventos.",
      icpScore: 65,
      fitScore: 60,
      painScore: 55,
      status: "active",
    },
  });

  // ---------- People ----------
  const apvDecisionMaker = await prisma.person.upsert({
    where: { id: "seed-person-apv-dm" },
    update: {},
    create: {
      id: "seed-person-apv-dm",
      companyId: apv.id,
      firstName: "Rodrigo",
      lastName: "Fuentes",
      email: "rodrigo.fuentes@apvventanas.cl",
      phone: "+56 9 5123 4567",
      roleTitle: "Gerente Comercial",
      isDecisionMaker: true,
      isSponsor: false,
    },
  });

  const apvSponsor = await prisma.person.upsert({
    where: { id: "seed-person-apv-sponsor" },
    update: {},
    create: {
      id: "seed-person-apv-sponsor",
      companyId: apv.id,
      firstName: "Camila",
      lastName: "Soto",
      email: "camila.soto@apvventanas.cl",
      phone: "+56 9 5987 6543",
      roleTitle: "Jefa de Operaciones",
      isDecisionMaker: false,
      isSponsor: true,
    },
  });

  const polpaicoDecisionMaker = await prisma.person.upsert({
    where: { id: "seed-person-polpaico-dm" },
    update: {},
    create: {
      id: "seed-person-polpaico-dm",
      companyId: polpaico.id,
      firstName: "Francisca",
      lastName: "Muñoz",
      email: "francisca.munoz@polpaico.cl",
      roleTitle: "Gerenta de TI",
      isDecisionMaker: true,
      isSponsor: false,
    },
  });

  const polpaicoSponsor = await prisma.person.upsert({
    where: { id: "seed-person-polpaico-sponsor" },
    update: {},
    create: {
      id: "seed-person-polpaico-sponsor",
      companyId: polpaico.id,
      firstName: "Ignacio",
      lastName: "Reyes",
      email: "ignacio.reyes@polpaico.cl",
      roleTitle: "Jefe de Proyectos",
      isDecisionMaker: false,
      isSponsor: true,
    },
  });

  const repopackDecisionMaker = await prisma.person.upsert({
    where: { id: "seed-person-repopack-dm" },
    update: {},
    create: {
      id: "seed-person-repopack-dm",
      companyId: repopack.id,
      firstName: "Valentina",
      lastName: "Pizarro",
      email: "valentina.pizarro@repopack.cl",
      roleTitle: "Dueña / Gerenta General",
      isDecisionMaker: true,
      isSponsor: true,
    },
  });

  // ---------- Opportunities ----------
  await prisma.opportunity.upsert({
    where: { id: "seed-opp-apv-propuesta" },
    update: {},
    create: {
      id: "seed-opp-apv-propuesta",
      companyId: apv.id,
      name: "Automatización de cotizaciones APV",
      stage: "propuesta_principal",
      estimatedValue: 8500000,
      probability: 60,
      source: "referido",
      mainPain:
        "El equipo comercial arma cotizaciones manualmente en Excel, lo que genera errores y demoras de hasta 3 días en responder a clientes.",
      urgency: "high",
      decisionMakerId: apvDecisionMaker.id,
      sponsorId: apvSponsor.id,
      nextStep: "Enviar propuesta ajustada con precios por volumen",
      nextStepDueDate: daysFromNow(-2),
      expectedCloseDate: daysFromNow(20),
      status: "open",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "seed-opp-polpaico-discovery" },
    update: {},
    create: {
      id: "seed-opp-polpaico-discovery",
      companyId: polpaico.id,
      name: "CRM comercial para fuerza de ventas Polpaico",
      stage: "reunion_discovery",
      estimatedValue: 15000000,
      probability: 30,
      source: "outbound",
      mainPain:
        "No tienen visibilidad del pipeline comercial entre las distintas zonas de venta.",
      urgency: "medium",
      decisionMakerId: polpaicoDecisionMaker.id,
      sponsorId: polpaicoSponsor.id,
      nextStep: "Coordinar reunión de discovery con jefes de zona",
      nextStepDueDate: daysFromNow(5),
      expectedCloseDate: daysFromNow(60),
      status: "open",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "seed-opp-polpaico-negociacion" },
    update: {},
    create: {
      id: "seed-opp-polpaico-negociacion",
      companyId: polpaico.id,
      name: "Sprint 0 - Diagnóstico procesos logísticos",
      stage: "negociacion",
      estimatedValue: 4000000,
      probability: 70,
      source: "referido",
      mainPain: "Procesos logísticos manuales entre planta y despacho.",
      urgency: "medium",
      decisionMakerId: polpaicoDecisionMaker.id,
      nextStep: "Negociar condiciones de pago del Sprint 0",
      nextStepDueDate: daysFromNow(7),
      expectedCloseDate: daysFromNow(15),
      status: "open",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "seed-opp-repopack-lead" },
    update: {},
    create: {
      id: "seed-opp-repopack-lead",
      companyId: repopack.id,
      name: "Tienda online Repopack",
      stage: "lead_identificado",
      estimatedValue: 3000000,
      probability: 10,
      source: "evento",
      mainPain: "No tienen canal de venta online, todo es por WhatsApp.",
      urgency: "low",
      decisionMakerId: repopackDecisionMaker.id,
      nextStep: "Agendar primer contacto",
      nextStepDueDate: daysFromNow(10),
      status: "open",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "seed-opp-repopack-ganado" },
    update: {},
    create: {
      id: "seed-opp-repopack-ganado",
      companyId: repopack.id,
      name: "Rediseño catálogo digital Repopack",
      stage: "ganado",
      estimatedValue: 2200000,
      probability: 100,
      source: "referido",
      mainPain: "Catálogo de productos desactualizado y sin fotos.",
      urgency: "low",
      decisionMakerId: repopackDecisionMaker.id,
      nextStep: "Kickoff de implementación",
      expectedCloseDate: daysFromNow(-5),
      status: "won",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "seed-opp-repopack-perdido" },
    update: {},
    create: {
      id: "seed-opp-repopack-perdido",
      companyId: repopack.id,
      name: "Integración ERP Repopack",
      stage: "perdido",
      estimatedValue: 6000000,
      probability: 0,
      source: "outbound",
      mainPain: "Sin integración entre inventario y ventas.",
      urgency: "low",
      status: "lost",
      lossReason: "Presupuesto asignado a otra prioridad este año",
    },
  });

  // ---------- Activities ----------
  await prisma.activity.upsert({
    where: { id: "seed-activity-apv-overdue" },
    update: {},
    create: {
      id: "seed-activity-apv-overdue",
      companyId: apv.id,
      opportunityId: "seed-opp-apv-propuesta",
      type: "follow_up",
      title: "Confirmar recepción de propuesta con Rodrigo",
      dueDate: daysFromNow(-1),
      status: "pending",
    },
  });

  await prisma.activity.upsert({
    where: { id: "seed-activity-polpaico-call" },
    update: {},
    create: {
      id: "seed-activity-polpaico-call",
      companyId: polpaico.id,
      opportunityId: "seed-opp-polpaico-discovery",
      personId: polpaicoSponsor.id,
      type: "call",
      title: "Llamada de agendamiento con Ignacio Reyes",
      dueDate: daysFromNow(2),
      status: "pending",
    },
  });

  await prisma.activity.upsert({
    where: { id: "seed-activity-repopack-completed" },
    update: {},
    create: {
      id: "seed-activity-repopack-completed",
      companyId: repopack.id,
      opportunityId: "seed-opp-repopack-ganado",
      type: "meeting",
      title: "Kickoff realizado con Valentina",
      status: "completed",
      completedAt: daysFromNow(-3),
    },
  });

  await prisma.activity.upsert({
    where: { id: "seed-activity-apv-task" },
    update: {},
    create: {
      id: "seed-activity-apv-task",
      companyId: apv.id,
      personId: apvSponsor.id,
      type: "task",
      title: "Enviar caso de éxito similar a APV",
      dueDate: daysFromNow(4),
      status: "pending",
    },
  });

  // ---------- Notes ----------
  await prisma.note.upsert({
    where: { id: "seed-note-polpaico-discovery" },
    update: {},
    create: {
      id: "seed-note-polpaico-discovery",
      opportunityId: "seed-opp-polpaico-discovery",
      title: "Notas de discovery call",
      body: "Participaron Francisca (Gerenta TI) e Ignacio (Jefe de Proyectos).\n\nDolor principal: cada zona de ventas usa una planilla distinta para trackear oportunidades, no hay forecast consolidado a nivel nacional.\n\nDecisión de compra pasa por Francisca, pero el presupuesto lo aprueba gerencia general. Ignacio es el sponsor day-to-day.\n\nPróximos pasos: preparar propuesta de Sprint 0 enfocada en mapear los procesos de las 3 zonas más grandes.",
    },
  });

  await prisma.note.upsert({
    where: { id: "seed-note-apv-context" },
    update: {},
    create: {
      id: "seed-note-apv-context",
      companyId: apv.id,
      title: "Contexto comercial APV",
      body: "APV Ventanas está creciendo ~20% anual y el equipo comercial (5 personas) ya no da abasto con Excel. Rodrigo (Gerente Comercial) es el decisor y quiere ver ROI concreto en reducción de tiempo de cotización.",
    },
  });

  // ---------- Custom field example ----------
  await prisma.customFieldDefinition.upsert({
    where: {
      entityType_fieldName: {
        entityType: "opportunity",
        fieldName: "fuenteLead",
      },
    },
    update: {},
    create: {
      id: "seed-customfield-fuente-lead",
      entityType: "opportunity",
      fieldName: "fuenteLead",
      fieldLabel: "Fuente del lead",
      fieldType: "select",
      optionsJson: ["Referido", "Outbound", "Evento", "Inbound"],
      isRequired: false,
    },
  });

  // ---------- Workflows ----------
  await prisma.workflow.upsert({
    where: { id: "seed-workflow-discovery" },
    update: {},
    create: {
      id: "seed-workflow-discovery",
      name: "Resumen post reunión discovery",
      description:
        'Cuando una oportunidad pasa a "reunión discovery", crea una tarea para enviar el resumen de la reunión.',
      triggerEntity: "opportunity",
      triggerEvent: "stage_changed",
      conditionsJson: [
        { field: "stage", op: "changed_to", value: "reunion_discovery" },
      ],
      actionsJson: [
        {
          type: "create_activity",
          title: "Enviar resumen de reunión",
          activityType: "follow_up",
          dueInDays: 1,
        },
      ],
      isActive: true,
    },
  });

  await prisma.workflow.upsert({
    where: { id: "seed-workflow-propuesta" },
    update: {},
    create: {
      id: "seed-workflow-propuesta",
      name: "Seguimiento de propuesta principal",
      description:
        'Cuando una oportunidad pasa a "propuesta principal", crea una tarea de seguimiento.',
      triggerEntity: "opportunity",
      triggerEvent: "stage_changed",
      conditionsJson: [
        { field: "stage", op: "changed_to", value: "propuesta_principal" },
      ],
      actionsJson: [
        {
          type: "create_activity",
          title: "Hacer seguimiento propuesta",
          activityType: "follow_up",
          dueInDays: 3,
        },
      ],
      isActive: true,
    },
  });

  await prisma.workflow.upsert({
    where: { id: "seed-workflow-overdue" },
    update: {},
    create: {
      id: "seed-workflow-overdue",
      name: "Alerta de próximo paso vencido",
      description:
        "Si el próximo paso de una oportunidad abierta está vencido, crea una tarea de seguimiento. Se evalúa vía el endpoint de cron /api/cron/check-overdue.",
      triggerEntity: "opportunity",
      triggerEvent: "field_overdue",
      conditionsJson: [],
      actionsJson: [
        {
          type: "create_activity",
          title: "Seguimiento de próximo paso vencido",
          activityType: "overdue_follow_up",
        },
      ],
      isActive: true,
    },
  });

  console.log("Seed completado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
