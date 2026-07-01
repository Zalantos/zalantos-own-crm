"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { createCompany, updateCompany, type FormState } from "./actions";
import type { Company } from "@prisma/client";

const STATUS_OPTIONS = ["active", "inactive", "churned"];

export function CompanyForm({
  company,
  customFieldsSection,
}: {
  company?: Company;
  customFieldsSection?: React.ReactNode;
}) {
  const action = company ? updateCompany : createCompany;
  const [state, formAction] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {company && <input type="hidden" name="id" value={company.id} />}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Nombre"
          name="name"
          defaultValue={company?.name}
          required
        />
        <Field
          label="Sitio web"
          name="website"
          defaultValue={company?.website ?? ""}
          error={state?.fieldErrors?.website}
        />
        <Field
          label="Industria"
          name="industry"
          defaultValue={company?.industry ?? ""}
        />
        <Field label="Tamaño" name="size" defaultValue={company?.size ?? ""} />
        <Field
          label="País"
          name="country"
          defaultValue={company?.country ?? ""}
        />
        <Field label="Ciudad" name="city" defaultValue={company?.city ?? ""} />
        <Field
          label="LinkedIn"
          name="linkedinUrl"
          defaultValue={company?.linkedinUrl ?? ""}
          error={state?.fieldErrors?.linkedinUrl}
        />
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <select
            id="status"
            name="status"
            defaultValue={company?.status ?? "active"}
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
          label="ICP score (0-100)"
          name="icpScore"
          type="number"
          defaultValue={company?.icpScore ?? ""}
        />
        <Field
          label="Fit score (0-100)"
          name="fitScore"
          type="number"
          defaultValue={company?.fitScore ?? ""}
        />
        <Field
          label="Pain score (0-100)"
          name="painScore"
          type="number"
          defaultValue={company?.painScore ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={company?.description ?? ""}
        />
      </div>

      {customFieldsSection}

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <SubmitButton>
        {company ? "Guardar cambios" : "Crear empresa"}
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
  defaultValue?: string | number | null;
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
