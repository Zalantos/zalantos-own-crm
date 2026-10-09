import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActivityWriteTools,
  completeTaskInputSchema,
  createActivityInputSchema,
  createMeetingInputSchema,
  updateTaskInputSchema,
} from "./write-activity";
import { buildTaskTools, listTasksInputSchema } from "./tasks";
import { buildWriteSafeTools } from "./write-safe";
import { buildTimelineTools } from "./timeline";
import { buildMeetingTools } from "./meetings";
import { buildReadTools } from "./read";
import {
  loggedActivityFromJson,
  loggedActivityToJson,
  manualMeetingFromJson,
  manualMeetingToJson,
  taskUpdateFromJson,
  taskUpdateToJson,
  type LoggedActivityInput,
  type ManualMeetingInput,
} from "@/lib/crm/activity-records";
import {
  baseSeed,
  createTestContext,
  type Row,
} from "./fake-crm-db.test-helper";

const PAST = "2026-10-07T15:00:00.000Z";

function without<T extends Record<string, unknown>>(value: T, key: keyof T) {
  const copy: Record<string, unknown> = { ...value };
  delete copy[key as string];
  return copy;
}

function setup(extra: Record<string, Row[]> = {}) {
  const harness = createTestContext({ ...baseSeed(), ...extra });
  return {
    ...harness,
    activityTools: buildActivityWriteTools(harness.ctx, harness.deps),
    taskTools: buildTaskTools(harness.ctx),
    safeTools: buildWriteSafeTools(harness.ctx, harness.deps),
  };
}

function seededTask(overrides: Row = {}): Row {
  return {
    id: "task-1",
    organizationId: "org-1",
    companyId: "co-1",
    opportunityId: "op-1",
    personId: null,
    type: "task",
    title: "Enviar propuesta",
    description: null,
    status: "todo",
    dueDate: new Date("2026-10-01T00:00:00Z"),
    assigneeId: "tm-1",
    priority: null,
    completedAt: null,
    completedById: null,
    statusChangedAt: null,
    blockedReason: null,
    occurredAt: null,
    createdAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
}

describe("create_activity", () => {
  const validArgs = {
    companyId: "co-1",
    opportunityId: "op-1",
    personIds: ["pe-1", "pe-2"],
    type: "call" as const,
    title: "Llamada de seguimiento",
    date: PAST,
    durationMinutes: 30,
    channel: "teléfono",
    summary: "Revisamos el alcance del piloto.",
    outcomes: "Envían datos de prueba el lunes.",
  };

  it("registra la actividad, sus personas, lastContactAt y el timeline", async () => {
    const { activityTools, rows, ctx } = setup();
    const result = await activityTools.create_activity.execute(validArgs);

    assert.equal(result.status, "created");
    const [activity] = rows("activity");
    assert.equal(activity.type, "call");
    assert.equal(activity.status, "done");
    assert.equal(activity.personId, "pe-1");
    assert.equal(activity.durationMinutes, 30);
    assert.equal(activity.channel, "teléfono");
    assert.equal(activity.outcomes, "Envían datos de prueba el lunes.");
    assert.equal((activity.occurredAt as Date).toISOString(), PAST);
    assert.deepEqual(
      rows("activityPerson").map((link) => link.personId),
      ["pe-1", "pe-2"],
    );

    const company = rows("company").find((c) => c.id === "co-1")!;
    assert.equal((company.lastContactAt as Date).toISOString(), PAST);

    const [event] = rows("timelineEvent");
    assert.equal(event.type, "activity_logged");
    assert.equal((event.occurredAt as Date).toISOString(), PAST);
    assert.equal(ctx.turnState.pendingInstant?.kind, "activity");
  });

  it("aparece en get_record_timeline y en recentActivities del snapshot", async () => {
    const { activityTools, ctx } = setup();
    await activityTools.create_activity.execute(validArgs);

    const timeline = await buildTimelineTools(ctx).get_record_timeline.execute({
      entity: "company",
      id: "co-1",
    });
    assert.ok("events" in timeline && timeline.events);
    const [latest] = timeline.events;
    assert.equal(latest.type, "activity_logged");
    assert.equal(latest.label, "Actividad registrada");

    const snapshot = await buildReadTools(ctx).get_company_snapshot.execute({
      companyId: "co-1",
    });
    const [recent] = snapshot.recentActivities;
    assert.equal(recent.title, "Llamada de seguimiento");
    assert.ok("occurredAt" in recent);
    assert.equal(recent.occurredAt, PAST);
  });

  it("no retrocede lastContactAt con una actividad más vieja", async () => {
    const { activityTools, rows } = setup();
    const result = await activityTools.create_activity.execute({
      ...validArgs,
      companyId: "co-2",
      opportunityId: undefined,
      personIds: [],
      date: "2026-09-01T10:00:00Z",
    });
    assert.ok("lastContactUpdated" in result);
    assert.equal(result.lastContactUpdated, false);
    const company = rows("company").find((c) => c.id === "co-2")!;
    assert.equal(
      (company.lastContactAt as Date).toISOString(),
      "2026-10-05T12:00:00.000Z",
    );
  });

  it("deshacer la escritura instantánea borra todo y restaura lastContactAt", async () => {
    const { activityTools, rows, ctx, tx } = setup();
    await activityTools.create_activity.execute(validArgs);
    await ctx.turnState.pendingInstant!.undo!(tx);

    assert.equal(rows("activity").length, 0);
    assert.equal(rows("activityPerson").length, 0);
    assert.equal(rows("timelineEvent").length, 0);
    assert.equal(
      rows("company").find((c) => c.id === "co-1")!.lastContactAt,
      null,
    );
  });

  it("si ya hubo otro cambio en el turno, queda en una propuesta", async () => {
    const { activityTools, rows, ctx } = setup();
    // Simula un cambio previo del turno que ya generó propuesta (el revert
    // de una escritura instantánea previa usa la DB real y no se cubre acá).
    ctx.turnState.changeCount = 1;
    const result = await activityTools.create_activity.execute(validArgs);

    assert.equal(result.status, "moved_to_proposal");
    assert.equal(rows("activity").length, 0);
    const [item] = rows("cRMChangeItem");
    assert.equal(item.type, "log_activity");
    assert.equal((item.afterValue as Row).companyId, "co-1");
  });

  it("rechaza ids inexistentes", async () => {
    const { activityTools, rows } = setup();
    await assert.rejects(
      async () =>
        activityTools.create_activity.execute({
          ...validArgs,
          companyId: "nope",
        }),
      /Empresa no encontrada: nope/,
    );
    await assert.rejects(
      async () =>
        activityTools.create_activity.execute({
          ...validArgs,
          opportunityId: "nope",
        }),
      /Oportunidad no encontrada: nope/,
    );
    await assert.rejects(
      async () =>
        activityTools.create_activity.execute({
          ...validArgs,
          opportunityId: "op-2",
        }),
      /no pertenece a la empresa/,
    );
    await assert.rejects(
      async () =>
        activityTools.create_activity.execute({
          ...validArgs,
          personIds: ["pe-1", "ghost"],
        }),
      /Persona no encontrada: ghost/,
    );
    assert.equal(rows("activity").length, 0);
  });

  it("rechaza fechas futuras", async () => {
    const { activityTools } = setup();
    await assert.rejects(
      async () =>
        activityTools.create_activity.execute({
          ...validArgs,
          date: "2099-01-01T00:00:00Z",
        }),
      /create_task/,
    );
  });

  it("valida campos requeridos y formatos", () => {
    for (const key of ["companyId", "type", "title", "date"] as const) {
      assert.equal(
        createActivityInputSchema.safeParse(without(validArgs, key)).success,
        false,
        key,
      );
    }
    assert.equal(
      createActivityInputSchema.safeParse({ ...validArgs, type: "lunch" })
        .success,
      false,
    );
    assert.equal(
      createActivityInputSchema.safeParse({ ...validArgs, date: "ayer" })
        .success,
      false,
    );
    assert.equal(createActivityInputSchema.safeParse(validArgs).success, true);
  });
});

describe("create_meeting", () => {
  const validArgs = {
    companyId: "co-1",
    opportunityId: "op-1",
    title: "Discovery con Acme",
    date: PAST,
    meetingType: "discovery",
    participants: [
      {
        name: "Ana Pérez",
        email: "ana@acme.com",
        company: "Acme",
        role: "CFO",
        internal: false,
      },
      { name: "Tomás", internal: true },
    ],
    summary: "Interés en el módulo de reportes.",
    keyPoints: ["Usan Excel hoy"],
    decisions: ["Avanzar con demo"],
    risks: ["Presupuesto Q1"],
    nextSteps: ["Enviar propuesta"],
  };

  it("crea una reunión lista, sin transcripción, visible en list_meetings y get_meeting", async () => {
    const { activityTools, rows, ctx } = setup();
    const result = await activityTools.create_meeting.execute(validArgs);
    assert.equal(result.status, "created");
    assert.ok("meetingId" in result);

    const [meeting] = rows("meeting");
    assert.equal(meeting.processingStatus, "ready");
    assert.equal(meeting.sourceType, "manual");
    assert.equal(meeting.rawTranscript, null);
    assert.deepEqual(meeting.participants, [
      {
        name: "Ana Pérez",
        email: "ana@acme.com",
        company: "Acme",
        role: "CFO",
        internal: false,
      },
      { name: "Tomás", internal: true },
    ]);
    assert.equal(rows("timelineEvent")[0].type, "meeting_created");

    const meetingTools = buildMeetingTools(ctx);
    const list = await meetingTools.list_meetings.execute({
      companyId: "co-1",
    });
    assert.equal(list.meetings[0].id, result.meetingId);
    assert.equal(
      list.meetings[0].headline,
      "Interés en el módulo de reportes.",
    );

    const detail = await meetingTools.get_meeting.execute({
      meetingId: result.meetingId,
    });
    assert.ok("summary" in detail);
    assert.deepEqual(detail.summary, {
      headline: "Interés en el módulo de reportes.",
      keyPoints: ["Usan Excel hoy"],
      decisions: ["Avanzar con demo"],
      risks: ["Presupuesto Q1"],
      nextSteps: ["Enviar propuesta"],
      source: "manual",
    });
    assert.equal(detail.transcriptChars, 0);
  });

  it("usa discovery como tipo por defecto", async () => {
    const { activityTools, rows } = setup();
    await activityTools.create_meeting.execute({
      companyId: "co-1",
      title: "Reunión breve",
      date: PAST,
    });
    assert.equal(rows("meeting")[0].meetingType, "discovery");
  });

  it("rechaza ids inexistentes", async () => {
    const { activityTools, rows } = setup();
    await assert.rejects(
      async () =>
        activityTools.create_meeting.execute({
          ...validArgs,
          companyId: "nope",
        }),
      /Empresa no encontrada/,
    );
    await assert.rejects(
      async () =>
        activityTools.create_meeting.execute({
          ...validArgs,
          opportunityId: "nope",
        }),
      /Oportunidad no encontrada/,
    );
    assert.equal(rows("meeting").length, 0);
  });

  it("valida campos requeridos", () => {
    for (const key of ["companyId", "title", "date"] as const) {
      assert.equal(
        createMeetingInputSchema.safeParse(without(validArgs, key)).success,
        false,
        key,
      );
    }
    assert.equal(
      createMeetingInputSchema.safeParse({
        ...validArgs,
        participants: [{ email: "x@y.com" }],
      }).success,
      false,
    );
  });

  it("queda en propuesta si no es el único cambio del turno", async () => {
    const { activityTools, rows, ctx } = setup();
    ctx.turnState.changeCount = 1;
    const result = await activityTools.create_meeting.execute(validArgs);
    assert.equal(result.status, "moved_to_proposal");
    assert.equal(rows("meeting").length, 0);
    assert.equal(rows("cRMChangeItem")[0].type, "create_meeting");
  });
});

describe("create_task (responsable y prioridad)", () => {
  it("asigna por email y guarda la prioridad", async () => {
    const { safeTools, rows } = setup();
    const result = await safeTools.create_task.execute({
      companyId: "co-1",
      title: "Preparar demo",
      dueDate: "2026-10-15",
      assigneeEmail: "CARLA@zalantos.com",
      priority: "high",
    });
    assert.ok("taskId" in result);
    const [task] = rows("activity");
    assert.equal(task.assigneeId, "tm-2");
    assert.equal(task.priority, "high");
  });

  it("acepta el id del usuario como responsable", async () => {
    const { safeTools, rows } = setup();
    await safeTools.create_task.execute({
      companyId: "co-1",
      title: "Llamar",
      assigneeId: "user-1",
    });
    assert.equal(rows("activity")[0].assigneeId, "tm-1");
  });

  it("sin los campos nuevos se comporta como antes", async () => {
    const { safeTools, rows } = setup();
    await safeTools.create_task.execute({ companyId: "co-1", title: "Tarea" });
    const [task] = rows("activity");
    assert.equal(task.assigneeId, null);
    assert.equal(task.priority, null);
    assert.equal(task.status, "todo");
  });

  it("rechaza responsables inexistentes o inactivos", async () => {
    const { safeTools, rows } = setup();
    await assert.rejects(
      async () =>
        safeTools.create_task.execute({
          companyId: "co-1",
          title: "x",
          assigneeId: "ghost",
        }),
      /Responsable no encontrado/,
    );
    await assert.rejects(
      async () =>
        safeTools.create_task.execute({
          companyId: "co-1",
          title: "x",
          assigneeEmail: "ex@zalantos.com",
        }),
      /Responsable no encontrado o inactivo/,
    );
    assert.equal(rows("activity").length, 0);
  });

  it("valida la prioridad", () => {
    const schema = setup().safeTools.create_task.inputSchema;
    assert.equal(
      schema.safeParse({ companyId: "co-1", title: "x", priority: "urgent" })
        .success,
      false,
    );
  });
});

describe("update_task / complete_task", () => {
  it("completa la tarea, registra timeline y dispara workflows", async () => {
    const { activityTools, rows, workflowCalls } = setup({
      activity: [seededTask()],
    });
    const result = await activityTools.complete_task.execute({
      taskId: "task-1",
    });

    assert.equal(result.status, "updated");
    const [task] = rows("activity");
    assert.equal(task.status, "done");
    assert.ok(task.completedAt instanceof Date);
    assert.equal(task.completedById, "tm-1");
    assert.equal(rows("timelineEvent")[0].type, "task_status_changed");
    assert.equal(workflowCalls.length, 1);
    assert.deepEqual(workflowCalls[0].after, { status: "done" });
  });

  it("cambia fecha, responsable, descripción y prioridad; pending se guarda como todo", async () => {
    const { activityTools, rows } = setup({
      activity: [
        seededTask({
          status: "done",
          completedAt: new Date(),
          completedById: "tm-1",
        }),
      ],
    });
    await activityTools.update_task.execute({
      taskId: "task-1",
      status: "pending",
      dueDate: "2026-10-20",
      assigneeEmail: "carla@zalantos.com",
      description: "Con precios nuevos",
      priority: "medium",
    });
    const [task] = rows("activity");
    assert.equal(task.status, "todo");
    assert.equal(task.completedAt, null);
    assert.equal(task.completedById, null);
    assert.equal(task.assigneeId, "tm-2");
    assert.equal(task.description, "Con precios nuevos");
    assert.equal(task.priority, "medium");
    assert.equal(
      (task.dueDate as Date).toISOString().slice(0, 10),
      "2026-10-20",
    );
    assert.deepEqual(
      rows("timelineEvent").map((event) => event.type),
      ["task_status_changed", "task_assigned", "task_updated"],
    );
  });

  it("null quita el responsable y el vencimiento", async () => {
    const { activityTools, rows } = setup({ activity: [seededTask()] });
    await activityTools.update_task.execute({
      taskId: "task-1",
      assigneeId: null,
      dueDate: null,
    });
    const [task] = rows("activity");
    assert.equal(task.assigneeId, null);
    assert.equal(task.dueDate, null);
  });

  it("edita los campos operativos completos de una tarea", async () => {
    const { activityTools, rows } = setup({ activity: [seededTask()] });
    await activityTools.update_task.execute({
      taskId: "task-1",
      type: "follow_up",
      status: "blocked",
      plannedDate: "2026-10-18",
      blockedReason: "Esperando aprobación",
      completedByEmail: "carla@zalantos.com",
    });
    const [task] = rows("activity");
    assert.equal(task.type, "follow_up");
    assert.equal(task.status, "blocked");
    assert.equal(task.blockedReason, "Esperando aprobación");
    assert.equal(task.completedById, "tm-2");
    assert.equal(
      (task.plannedDate as Date).toISOString().slice(0, 10),
      "2026-10-18",
    );
  });

  it("completar una tarea ya hecha no es un cambio", async () => {
    const { activityTools, ctx, rows } = setup({
      activity: [seededTask({ status: "done" })],
    });
    const result = await activityTools.complete_task.execute({
      taskId: "task-1",
    });
    assert.equal(result.status, "unchanged");
    assert.equal(ctx.turnState.changeCount, 0);
    assert.equal(rows("timelineEvent").length, 0);
  });

  it("deshacer restaura el estado anterior y borra los eventos", async () => {
    const { activityTools, ctx, rows, tx } = setup({
      activity: [seededTask()],
    });
    await activityTools.complete_task.execute({ taskId: "task-1" });
    await ctx.turnState.pendingInstant!.undo!(tx);
    const [task] = rows("activity");
    assert.equal(task.status, "todo");
    assert.equal(task.completedAt, null);
    assert.equal(rows("timelineEvent").length, 0);
  });

  it("queda en propuesta si no es el único cambio del turno", async () => {
    const { activityTools, ctx, rows } = setup({ activity: [seededTask()] });
    ctx.turnState.changeCount = 1;
    const result = await activityTools.complete_task.execute({
      taskId: "task-1",
    });
    assert.equal(result.status, "moved_to_proposal");
    assert.equal(rows("activity")[0].status, "todo");
    const [item] = rows("cRMChangeItem");
    assert.equal(item.type, "update_task");
    assert.deepEqual(item.afterValue, { taskId: "task-1", status: "done" });
  });

  it("rechaza ids inexistentes y actividades registradas", async () => {
    const { activityTools } = setup({
      activity: [
        seededTask({
          id: "logged-1",
          occurredAt: new Date(PAST),
          status: "done",
        }),
      ],
    });
    await assert.rejects(
      async () =>
        activityTools.update_task.execute({ taskId: "ghost", status: "done" }),
      /Tarea no encontrada: ghost/,
    );
    await assert.rejects(
      async () => activityTools.complete_task.execute({ taskId: "logged-1" }),
      /Tarea no encontrada: logged-1/,
    );
    await assert.rejects(
      async () =>
        setup({ activity: [seededTask()] }).activityTools.update_task.execute({
          taskId: "task-1",
          assigneeEmail: "nadie@zalantos.com",
        }),
      /Responsable no encontrado/,
    );
  });

  it("exige al menos un campo y valida el schema", async () => {
    const { activityTools } = setup({ activity: [seededTask()] });
    await assert.rejects(
      async () => activityTools.update_task.execute({ taskId: "task-1" }),
      /al menos un campo/,
    );
    assert.equal(
      updateTaskInputSchema.safeParse({ status: "done" }).success,
      false,
    );
    assert.equal(
      updateTaskInputSchema.safeParse({ taskId: "task-1", status: "cancelled" })
        .success,
      false,
    );
    assert.equal(
      updateTaskInputSchema.safeParse({ taskId: "task-1", dueDate: "mañana" })
        .success,
      false,
    );
    assert.equal(completeTaskInputSchema.safeParse({}).success, false);
  });
});

describe("list_tasks", () => {
  const tasks = [
    seededTask(),
    seededTask({
      id: "task-2",
      title: "Demo",
      companyId: "co-2",
      opportunityId: "op-2",
      assigneeId: "tm-2",
      dueDate: new Date("2099-01-01T00:00:00Z"),
      priority: "high",
    }),
    seededTask({ id: "task-3", title: "Hecha", status: "done" }),
    seededTask({
      id: "logged-1",
      type: "call",
      status: "done",
      occurredAt: new Date(PAST),
    }),
  ];

  it("por defecto trae solo tareas abiertas y no incluye actividades registradas", async () => {
    const { taskTools } = setup({ activity: tasks });
    const result = await taskTools.list_tasks.execute({});
    assert.deepEqual(
      result.tasks.map((task) => task.taskId),
      ["task-1", "task-2"],
    );
    assert.equal(result.tasks[0].status, "pending");
    assert.equal(result.tasks[0].overdue, true);
    assert.equal(result.tasks[1].overdue, false);
  });

  it("filtra por empresa, oportunidad, responsable, estado, prioridad y vencimiento", async () => {
    const { taskTools } = setup({ activity: tasks });
    const ids = async (
      args: Parameters<typeof taskTools.list_tasks.execute>[0],
    ) =>
      (await taskTools.list_tasks.execute(args)).tasks.map(
        (task) => task.taskId,
      );

    assert.deepEqual(await ids({ companyId: "co-2" }), ["task-2"]);
    assert.deepEqual(await ids({ opportunityId: "op-1" }), ["task-1"]);
    assert.deepEqual(await ids({ assigneeEmail: "carla@zalantos.com" }), [
      "task-2",
    ]);
    assert.deepEqual(await ids({ assigneeId: "me" }), ["task-1"]);
    assert.deepEqual(await ids({ status: ["done"] }), ["task-3"]);
    assert.deepEqual(await ids({ priority: ["high"] }), ["task-2"]);
    assert.deepEqual(await ids({ overdue: true }), ["task-1"]);
    assert.deepEqual(await ids({ dueAfter: "2030-01-01" }), ["task-2"]);
  });

  it("rechaza un responsable inexistente", async () => {
    const { taskTools } = setup({ activity: tasks });
    await assert.rejects(
      async () => taskTools.list_tasks.execute({ assigneeId: "ghost" }),
      /Responsable no encontrado/,
    );
  });

  it("valida el schema", () => {
    assert.equal(
      listTasksInputSchema.safeParse({ status: ["cancelled"] }).success,
      false,
    );
    assert.equal(
      listTasksInputSchema.safeParse({ dueBefore: "pronto" }).success,
      false,
    );
    assert.equal(listTasksInputSchema.safeParse({ limit: 500 }).success, false);
    assert.equal(listTasksInputSchema.safeParse({}).success, true);
  });
});

describe("afterValue de propuestas (ida y vuelta a JSON)", () => {
  it("conserva los datos de una actividad registrada", () => {
    const input: LoggedActivityInput = {
      companyId: "co-1",
      opportunityId: "op-1",
      personIds: ["pe-1"],
      type: "visit",
      title: "Visita a planta",
      occurredAt: new Date(PAST),
      durationMinutes: 90,
      channel: "presencial",
      summary: "Recorrido",
      outcomes: null,
    };
    assert.deepEqual(
      loggedActivityFromJson(loggedActivityToJson(input), null),
      input,
    );
  });

  it("conserva los datos de una reunión manual", () => {
    const input: ManualMeetingInput = {
      companyId: "co-1",
      opportunityId: null,
      title: "Técnica",
      meetingType: "técnica",
      meetingDate: new Date(PAST),
      participants: [
        {
          name: "Ana",
          email: "ana@acme.com",
          company: null,
          role: null,
          internal: false,
        },
      ],
      summary: null,
      keyPoints: ["a"],
      decisions: [],
      risks: [],
      nextSteps: ["b"],
    };
    assert.deepEqual(
      manualMeetingFromJson(manualMeetingToJson(input), null),
      input,
    );
  });

  it("conserva solo los campos que cambian en una edición de tarea", () => {
    const json = taskUpdateToJson("task-1", { status: "done", dueDate: null });
    assert.deepEqual(json, { taskId: "task-1", status: "done", dueDate: null });
    assert.deepEqual(taskUpdateFromJson(json), {
      taskId: "task-1",
      input: { status: "done", dueDate: null },
    });
    assert.throws(() =>
      taskUpdateFromJson({ taskId: "t", status: "cancelled" }),
    );
  });
});
