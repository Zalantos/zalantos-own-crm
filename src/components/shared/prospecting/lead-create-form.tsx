"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { createLeadAction, type LeadFormState } from "@/app/(dashboard)/prospecting/actions";
import { SOURCE_CHANNELS, SOURCE_CHANNEL_LABELS } from "@/lib/commercial/attribution";
import { ACTIVITY_TYPE_LABELS, INTERACTION_TYPES } from "@/lib/activity-types";
import { NEXT_STEP_CHANNELS, NEXT_STEP_CHANNEL_LABELS } from "@/lib/commercial/next-action";

const selectClass = "bg-background h-9 w-full rounded-md border px-3 text-sm";

type Option = { id: string; label: string };

export function LeadCreateForm({
  companies,
  people,
  users,
  campaigns,
  partners,
  currentUserId,
  defaults,
}: {
  companies: Option[];
  people: Option[];
  users: Option[];
  campaigns: Option[];
  partners: Option[];
  currentUserId: string;
  defaults?: { companyId?: string; personId?: string; referrerPartnerId?: string };
}) {
  const [state, formAction] = useActionState<LeadFormState, FormData>(createLeadAction, undefined);
  const [companyId, setCompanyId] = useState(defaults?.companyId ?? "");
  const [personId, setPersonId] = useState(defaults?.personId ?? "");
  const [status, setStatus] = useState<"prospect" | "contacted" | "lead">("prospect");
  const [channel, setChannel] = useState(defaults?.referrerPartnerId ? "partner" : "");

  return (
    <form action={formAction} className="max-w-3xl space-y-8">
      <Section title="Empresa y persona">
        <div className="space-y-2">
          <Label htmlFor="companyId">Empresa existente</Label>
          <select id="companyId" name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={selectClass}>
            <option value="">— Nueva o sin empresa —</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.label}
              </option>
            ))}
          </select>
        </div>
        {!companyId && <Field label="Nombre de empresa nueva" name="companyName" />}
        <div className="space-y-2">
          <Label htmlFor="personId">Persona existente</Label>
          <select id="personId" name="personId" value={personId} onChange={(e) => setPersonId(e.target.value)} className={selectClass}>
            <option value="">— Nueva o sin persona —</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        {!personId && (
          <>
            <Field label="Nombre" name="firstName" />
            <Field label="Apellido" name="lastName" />
            <Field label="Email" name="email" type="email" />
            <Field label="Teléfono" name="phone" />
            <Field label="Cargo" name="roleTitle" />
            <Field label="LinkedIn" name="linkedinUrl" />
          </>
        )}
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Si la persona o empresa ya existe (mismo email o nombre), se reutiliza en vez de duplicarla.
        </p>
      </Section>

      <Section title="Prospecto">
        <Field label="Nombre del prospecto (opcional)" name="title" />
        <div className="space-y-2">
          <Label htmlFor="status">Estado inicial</Label>
          <select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={selectClass}
          >
            <option value="prospect">Prospecto (sin contacto aún)</option>
            <option value="contacted">Contactado (ya hubo un intento)</option>
            <option value="lead">Lead (manifestó interés)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ownerId">Responsable</Label>
          <select id="ownerId" name="ownerId" defaultValue={currentUserId} className={selectClass}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Prioridad</Label>
          <select id="priority" name="priority" defaultValue="" className={selectClass}>
            <option value="">Sin prioridad</option>
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </div>
        <TextArea label="Descripción y contexto" name="description" />
        {status === "lead" && (
          <TextArea label="Señal de interés o necesidad (obligatoria)" name="interestSignal" required />
        )}
        {status === "contacted" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="contactType">Canal del primer contacto</Label>
              <select id="contactType" name="contactType" required className={selectClass}>
                {INTERACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Fecha del contacto" name="contactAt" type="date" />
            <TextArea label="Qué se envió o habló" name="contactSummary" />
          </>
        )}
      </Section>

      <Section title="Origen comercial">
        <div className="space-y-2">
          <Label htmlFor="sourceChannel">Canal</Label>
          <select id="sourceChannel" name="sourceChannel" value={channel} onChange={(e) => setChannel(e.target.value)} className={selectClass}>
            <option value="">Sin registrar</option>
            {SOURCE_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {SOURCE_CHANNEL_LABELS[value]}
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
                  {campaign.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="referrerPartnerId">Partner que lo refirió</Label>
          <select id="referrerPartnerId" name="referrerPartnerId" defaultValue={defaults?.referrerPartnerId ?? ""} className={selectClass}>
            <option value="">Sin partner</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="referrerPersonId">Persona que lo refirió</Label>
          <select id="referrerPersonId" name="referrerPersonId" defaultValue="" className={selectClass}>
            <option value="">Sin referidor</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Detalle (evento, post, búsqueda...)" name="sourceDetail" />
        <Field label="utm_campaign (si aplica)" name="utmCampaign" />
      </Section>

      <Section title="Próxima acción">
        <Field label="Acción" name="nextStep" />
        <Field label="Fecha" name="nextStepDueDate" type="date" />
        <div className="space-y-2">
          <Label htmlFor="nextStepChannel">Canal</Label>
          <select id="nextStepChannel" name="nextStepChannel" defaultValue="" className={selectClass}>
            <option value="">Sin canal</option>
            {NEXT_STEP_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {NEXT_STEP_CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {state && "error" in state && (
        <p className="text-destructive text-sm">
          {state.error}{" "}
          {state.duplicateOfId && (
            <Link href={`/prospecting/${state.duplicateOfId}`} className="underline">
              Abrir el existente
            </Link>
          )}
        </p>
      )}
      <SubmitButton pendingText="Creando...">Crear prospecto</SubmitButton>
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

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} />
    </div>
  );
}

function TextArea({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} rows={2} required={required} />
    </div>
  );
}
