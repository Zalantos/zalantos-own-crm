"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { createCompany, updateCompany, type FormState } from "./actions";
import type { Company } from "@prisma/client";

const STATUS_OPTIONS = [
  { value: "active", label: "Activa" },
  { value: "inactive", label: "Inactiva" },
  { value: "churned", label: "Perdida" },
];

function dateInputValue(value?: Date | string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

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
    <form action={formAction} className="max-w-3xl space-y-6">
      {company && <input type="hidden" name="id" value={company.id} />}

      <section className="space-y-4">
        <h2 className="text-sm font-medium">Datos básicos</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Field
            label="Tamaño"
            name="size"
            defaultValue={company?.size ?? ""}
          />
          <Field
            label="País"
            name="country"
            defaultValue={company?.country ?? ""}
          />
          <Field
            label="Ciudad"
            name="city"
            defaultValue={company?.city ?? ""}
          />
          <Field
            label="LinkedIn"
            name="linkedinUrl"
            defaultValue={company?.linkedinUrl ?? ""}
            error={state?.fieldErrors?.linkedinUrl}
          />
          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <Select name="status" defaultValue={company?.status ?? "active"}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">Información comercial</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Origen"
            name="source"
            defaultValue={company?.source ?? ""}
          />
          <Field
            label="Prioridad"
            name="priority"
            defaultValue={company?.priority ?? ""}
          />
          <Field
            label="Producto/servicio de interés"
            name="productInterest"
            defaultValue={company?.productInterest ?? ""}
          />
          <Field
            label="Valor potencial"
            name="potentialValue"
            type="number"
            defaultValue={company?.potentialValue?.toString() ?? ""}
            error={state?.fieldErrors?.potentialValue}
          />
          <Field
            label="Timing de compra"
            name="buyingTiming"
            defaultValue={company?.buyingTiming ?? ""}
          />
          <Field
            label="Urgencia"
            name="urgency"
            defaultValue={company?.urgency ?? ""}
          />
          <Field
            label="Competidor"
            name="competitor"
            defaultValue={company?.competitor ?? ""}
          />
          <Field
            label="Proveedor actual"
            name="currentProvider"
            defaultValue={company?.currentProvider ?? ""}
          />
          <Field
            label="Próximo paso"
            name="nextStep"
            defaultValue={company?.nextStep ?? ""}
          />
          <Field
            label="Fecha del próximo paso"
            name="nextStepDueDate"
            type="date"
            defaultValue={dateInputValue(company?.nextStepDueDate)}
            error={state?.fieldErrors?.nextStepDueDate}
          />
          <Field
            label="Último contacto"
            name="lastContactAt"
            type="date"
            defaultValue={dateInputValue(company?.lastContactAt)}
            error={state?.fieldErrors?.lastContactAt}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mainPain">Dolor principal</Label>
          <Textarea
            id="mainPain"
            name="mainPain"
            rows={4}
            defaultValue={company?.mainPain ?? ""}
          />
        </div>
      </section>

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
