"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { createOpportunity, updateOpportunity, type FormState } from "./actions";
import type { StageOption } from "@/lib/pipeline/stages";
import type { Company, Opportunity, Person } from "@prisma/client";
import type { AssignableUser } from "@/lib/team";
import { SPRINT0_STATUSES, SPRINT0_STATUS_LABELS } from "@/lib/zod/opportunity";
import { SOURCE_CHANNELS, SOURCE_CHANNEL_LABELS } from "@/lib/commercial/attribution";

type PersonWithCompanies = Person & {
  companyRelationships: Array<{ companyId: string }>;
};

const URGENCY_OPTIONS = [
  ["low", "Baja"],
  ["medium", "Media"],
  ["high", "Alta"],
] as const;

const selectClass = "bg-background h-9 w-full rounded-md border px-3 text-sm";

export function OpportunityForm({
  opportunity,
  currentStage,
  companies,
  people,
  stages,
  users,
  currentUserId,
  defaultCompanyId,
  customFieldsSection,
  campaigns = [],
  partners = [],
}: {
  opportunity?: Opportunity;
  // Etapa actual aunque esté retirada (registros legacy), para no moverla
  // sin querer al guardar.
  currentStage?: { id: string; label: string; isActive: boolean };
  companies: Company[];
  people: PersonWithCompanies[];
  stages: StageOption[];
  users: AssignableUser[];
  currentUserId?: string;
  defaultCompanyId?: string;
  customFieldsSection?: React.ReactNode;
  campaigns?: { id: string; name: string }[];
  partners?: { id: string; displayName: string }[];
}) {
  const action = opportunity ? updateOpportunity : createOpportunity;
  const [state, formAction] = useActionState<FormState, FormData>(action, undefined);
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    opportunity?.companyId ?? defaultCompanyId ?? "",
  );
  const ownerIsListed =
    !opportunity?.ownerId || users.some((user) => user.id === opportunity.ownerId);
  const eligiblePeople = people.filter((person) =>
    person.companyRelationships.some(
      (relationship) => relationship.companyId === selectedCompanyId,
    ),
  );
  const fieldError = (name: string) => state?.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="max-w-3xl space-y-8">
      {opportunity && <input type="hidden" name="id" value={opportunity.id} />}

      <Section title="Negocio">
        <div className="space-y-2">
          <Label htmlFor="companyId">Empresa</Label>
          <select
            id="companyId"
            name="companyId"
            required
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
            className={selectClass}
          >
            <option value="">Seleccionar empresa...</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="Nombre del negocio" name="name" defaultValue={opportunity?.name} required />
        <div className="space-y-2">
          <Label htmlFor="stageId">Etapa</Label>
          <select
            id="stageId"
            name="stageId"
            defaultValue={opportunity?.stageId ?? stages[0]?.id ?? ""}
            className={selectClass}
          >
            {currentStage && !currentStage.isActive && (
              <option value={currentStage.id}>{currentStage.label} (retirada)</option>
            )}
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Avanzar exige los requisitos de cada etapa; el estado (pausada,
            ganada, perdida) se cambia desde la ficha.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ownerId">Responsable</Label>
          <select
            id="ownerId"
            name="ownerId"
            defaultValue={opportunity?.ownerId ?? currentUserId ?? ""}
            required
            className={selectClass}
          >
            <option value="">Sin responsable</option>
            {ownerIsListed ? null : (
              <option value={opportunity?.ownerId ?? ""}>Usuario desactivado</option>
            )}
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email}
              </option>
            ))}
          </select>
          {fieldError("ownerId") && <p className="text-destructive text-xs">{fieldError("ownerId")}</p>}
        </div>
        <Field
          label="Monto implementación (opcional en Discovery)"
          name="estimatedValue"
          type="number"
          defaultValue={opportunity?.estimatedValue?.toString() ?? ""}
        />
        <Field
          label="Recurrente mensual"
          name="recurringValue"
          type="number"
          defaultValue={opportunity?.recurringValue?.toString() ?? ""}
        />
        <Field
          label="Probabilidad (%)"
          name="probability"
          type="number"
          defaultValue={opportunity?.probability ?? ""}
        />
        <Field
          label="Cierre esperado"
          name="expectedCloseDate"
          type="date"
          defaultValue={toDateInputValue(opportunity?.expectedCloseDate)}
        />
        <PersonSelect label="Decisor" name="decisionMakerId" people={eligiblePeople} defaultValue={opportunity?.decisionMakerId} />
        <PersonSelect label="Sponsor" name="sponsorId" people={eligiblePeople} defaultValue={opportunity?.sponsorId} />
        <div className="space-y-2">
          <Label htmlFor="urgency">Urgencia</Label>
          <select id="urgency" name="urgency" defaultValue={opportunity?.urgency ?? ""} className={selectClass}>
            <option value="">Sin definir</option>
            {URGENCY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Próxima acción">
        <Field label="Acción" name="nextStep" defaultValue={opportunity?.nextStep ?? ""} />
        <Field
          label="Fecha"
          name="nextStepDueDate"
          type="date"
          defaultValue={toDateInputValue(opportunity?.nextStepDueDate)}
        />
      </Section>

      <Section title="Calificación SPICED (deseable, no bloquea salvo Pain para calificar)">
        <TextArea label="Situation — situación actual" name="situation" defaultValue={opportunity?.situation} />
        <TextArea label="Pain — dolor o necesidad" name="mainPain" defaultValue={opportunity?.mainPain} />
        <TextArea label="Impact — hipótesis de impacto" name="impact" defaultValue={opportunity?.impact} />
        <TextArea label="Critical Event — evento que fuerza la decisión" name="criticalEvent" defaultValue={opportunity?.criticalEvent} />
        <Field
          label="Fecha del evento crítico"
          name="criticalEventDate"
          type="date"
          defaultValue={toDateInputValue(opportunity?.criticalEventDate)}
        />
        <TextArea label="Decision — quién y cómo decide" name="decisionProcess" defaultValue={opportunity?.decisionProcess} />
      </Section>

      <Section title="Sprint 0 y propuesta">
        <div className="space-y-2">
          <Label htmlFor="sprint0Status">Sprint 0</Label>
          <select id="sprint0Status" name="sprint0Status" defaultValue={opportunity?.sprint0Status ?? ""} className={selectClass}>
            <option value="">Sin Sprint 0</option>
            {SPRINT0_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SPRINT0_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <Field label="Sprint 0 agendado para" name="sprint0ScheduledAt" type="date" defaultValue={toDateInputValue(opportunity?.sprint0ScheduledAt)} />
        <Field label="Sprint 0 realizado el" name="sprint0CompletedAt" type="date" defaultValue={toDateInputValue(opportunity?.sprint0CompletedAt)} />
        <Field label="Diagnóstico entregado el" name="diagnosisDeliveredAt" type="date" defaultValue={toDateInputValue(opportunity?.diagnosisDeliveredAt)} />
        <Field label="Respuesta esperada de la propuesta" name="expectedResponseAt" type="date" defaultValue={toDateInputValue(opportunity?.expectedResponseAt)} />
      </Section>

      {!opportunity && (
        <Section title="Origen comercial (primer toque)">
          <div className="space-y-2">
            <Label htmlFor="sourceChannel">Canal</Label>
            <select id="sourceChannel" name="sourceChannel" defaultValue="" className={selectClass}>
              <option value="">Sin registrar</option>
              {SOURCE_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {SOURCE_CHANNEL_LABELS[channel]}
                </option>
              ))}
            </select>
          </div>
          {campaigns.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="campaignId">Campaña</Label>
              <select id="campaignId" name="campaignId" defaultValue="" className={selectClass}>
                <option value="">Sin campaña</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {partners.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="referrerPartnerId">Partner referidor</Label>
              <select id="referrerPartnerId" name="referrerPartnerId" defaultValue="" className={selectClass}>
                <option value="">Sin partner</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <PersonSelect label="Persona referidora" name="referrerPersonId" people={people} />
          <Field label="Detalle del origen" name="sourceDetail" />
        </Section>
      )}

      {customFieldsSection}

      {state?.error && <p className="text-destructive text-sm">{state.error}</p>}

      <SubmitButton>{opportunity ? "Guardar cambios" : "Crear oportunidad"}</SubmitButton>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function PersonSelect({
  label,
  name,
  people,
  defaultValue,
}: {
  label: string;
  name: string;
  people: Person[];
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} className={selectClass}>
        <option value="">Sin definir</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.firstName} {person.lastName}
          </option>
        ))}
      </select>
    </div>
  );
}

function toDateInputValue(date?: Date | null) {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} rows={2} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} />
    </div>
  );
}
