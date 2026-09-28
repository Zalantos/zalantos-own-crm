"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";
import { createPerson, updatePerson, type FormState } from "./actions";
import type { Company, Person } from "@prisma/client";

export function PersonForm({
  person,
  companies,
  defaultCompanyId,
  customFieldsSection,
}: {
  person?: Person;
  companies: Company[];
  defaultCompanyId?: string;
  customFieldsSection?: React.ReactNode;
}) {
  const action = person ? updatePerson : createPerson;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {person && <input type="hidden" name="id" value={person.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="companyId">Empresa</Label>
          <select
            id="companyId"
            name="companyId"
            defaultValue={person?.companyId ?? defaultCompanyId ?? ""}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Sin empresa</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Cargo"
          name="roleTitle"
          defaultValue={person?.roleTitle ?? ""}
        />
        <Field
          label="Nombre"
          name="firstName"
          defaultValue={person?.firstName}
          required
        />
        <Field
          label="Apellido"
          name="lastName"
          defaultValue={person?.lastName}
          required
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={person?.email ?? ""}
          error={state?.fieldErrors?.email}
        />
        <Field
          label="Teléfono"
          name="phone"
          defaultValue={person?.phone ?? ""}
        />
        <Field
          label="LinkedIn"
          name="linkedinUrl"
          defaultValue={person?.linkedinUrl ?? ""}
          error={state?.fieldErrors?.linkedinUrl}
        />
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isDecisionMaker"
            defaultChecked={person?.isDecisionMaker}
            className="border-input h-4 w-4 rounded"
          />
          Es decisor
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isSponsor"
            defaultChecked={person?.isSponsor}
            className="border-input h-4 w-4 rounded"
          />
          Es sponsor
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={person?.notes ?? ""}
        />
      </div>

      {customFieldsSection}

      {state?.conflict ? (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{state.error}</p>
          <Link href={state.conflict.href} className="font-medium underline">
            Ver contacto existente
          </Link>
          {state.conflict.kind === "name" && (
            <div>
              <Button
                type="submit"
                name="confirmNameMatch"
                value={state.conflict.personId}
                variant="secondary"
                disabled={pending}
              >
                Crear igual
              </Button>
            </div>
          )}
        </div>
      ) : state?.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}

      <SubmitButton>
        {person ? "Guardar cambios" : "Crear persona"}
      </SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  error,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  error?: string[];
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
      {error && <p className="text-destructive text-xs">{error[0]}</p>}
    </div>
  );
}
