"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  createOpportunity,
  updateOpportunity,
  type FormState,
} from "./actions";
import type { StageOption } from "@/lib/pipeline/stages";
import type { Company, Opportunity, Person } from "@prisma/client";
import type { AssignableUser } from "@/lib/team";
import {
  LOSS_REASONS,
  LOSS_REASON_LABELS,
} from "@/lib/opportunities/loss-reason";

type PersonWithCompanies = Person & {
  companyRelationships: Array<{ companyId: string }>;
};

const URGENCY_OPTIONS = ["low", "medium", "high"];
const STATUS_OPTIONS = ["open", "won", "lost"];

export function OpportunityForm({
  opportunity,
  companies,
  people,
  stages,
  users,
  currentUserId,
  defaultCompanyId,
  customFieldsSection,
}: {
  opportunity?: Opportunity;
  companies: Company[];
  people: PersonWithCompanies[];
  stages: StageOption[];
  users: AssignableUser[];
  currentUserId?: string;
  defaultCompanyId?: string;
  customFieldsSection?: React.ReactNode;
}) {
  const action = opportunity ? updateOpportunity : createOpportunity;
  const [state, formAction] = useActionState<FormState, FormData>(
    action,
    undefined,
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    opportunity?.companyId ?? defaultCompanyId ?? "",
  );
  const ownerIsListed =
    !opportunity?.ownerId ||
    users.some((user) => user.id === opportunity.ownerId);
  const eligiblePeople = people.filter((person) =>
    person.companyRelationships.some(
      (relationship) => relationship.companyId === selectedCompanyId,
    ),
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {opportunity && <input type="hidden" name="id" value={opportunity.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="companyId">Empresa</Label>
          <select
            id="companyId"
            name="companyId"
            required
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Seleccionar empresa...</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Nombre de la oportunidad"
          name="name"
          defaultValue={opportunity?.name}
          required
        />

        <div className="space-y-2">
          <Label htmlFor="stageId">Etapa</Label>
          <select
            id="stageId"
            name="stageId"
            defaultValue={opportunity?.stageId ?? stages[0]?.id ?? ""}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <select
            id="status"
            name="status"
            defaultValue={opportunity?.status ?? "open"}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Valor estimado"
          name="estimatedValue"
          type="number"
          defaultValue={opportunity?.estimatedValue?.toString() ?? ""}
        />
        <Field
          label="Probabilidad (%)"
          name="probability"
          type="number"
          defaultValue={opportunity?.probability ?? ""}
        />

        <div className="space-y-2">
          <Label htmlFor="decisionMakerId">Decisor</Label>
          <select
            id="decisionMakerId"
            name="decisionMakerId"
            defaultValue={opportunity?.decisionMakerId ?? ""}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin definir</option>
            {eligiblePeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sponsorId">Sponsor</Label>
          <select
            id="sponsorId"
            name="sponsorId"
            defaultValue={opportunity?.sponsorId ?? ""}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin definir</option>
            {eligiblePeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="urgency">Urgencia</Label>
          <select
            id="urgency"
            name="urgency"
            defaultValue={opportunity?.urgency ?? ""}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin definir</option>
            {URGENCY_OPTIONS.map((urgency) => (
              <option key={urgency} value={urgency}>
                {urgency}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Fuente"
          name="source"
          defaultValue={opportunity?.source ?? ""}
        />

        <Field
          label="Próximo paso"
          name="nextStep"
          defaultValue={opportunity?.nextStep ?? ""}
        />
        <Field
          label="Fecha próximo paso"
          name="nextStepDueDate"
          type="date"
          defaultValue={toDateInputValue(opportunity?.nextStepDueDate)}
        />
        <Field
          label="Cierre esperado"
          name="expectedCloseDate"
          type="date"
          defaultValue={toDateInputValue(opportunity?.expectedCloseDate)}
        />
        <div className="space-y-2">
          <Label htmlFor="ownerId">Responsable</Label>
          <select
            id="ownerId"
            name="ownerId"
            defaultValue={opportunity?.ownerId ?? currentUserId ?? ""}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin responsable</option>
            {ownerIsListed ? null : (
              <option value={opportunity?.ownerId ?? ""}>
                Usuario desactivado
              </option>
            )}
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lossReason">Motivo de pérdida</Label>
          <select
            id="lossReason"
            name="lossReason"
            defaultValue={opportunity?.lossReason ?? ""}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin definir</option>
            {LOSS_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {LOSS_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.lossReason && (
            <p className="text-destructive text-xs">
              {state.fieldErrors.lossReason[0]}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mainPain">Dolor principal</Label>
        <Textarea
          id="mainPain"
          name="mainPain"
          rows={3}
          defaultValue={opportunity?.mainPain ?? ""}
        />
      </div>

      {customFieldsSection}

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <SubmitButton>
        {opportunity ? "Guardar cambios" : "Crear oportunidad"}
      </SubmitButton>
    </form>
  );
}

function toDateInputValue(date?: Date | null) {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
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
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </div>
  );
}
