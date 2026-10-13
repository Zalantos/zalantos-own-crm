"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";
import { createPerson, updatePerson, type FormState } from "./actions";
import type {
  Company,
  Person,
  PersonCompanyRelationship,
} from "@prisma/client";

type EditableRelationship = {
  companyId: string;
  rolesText: string;
  roleTitle: string;
  isPrimary: boolean;
  notes: string;
};

type PersonWithRelationships = Person & {
  companyRelationships?: PersonCompanyRelationship[];
};

export function PersonForm({
  person,
  companies,
  defaultCompanyId,
  customFieldsSection,
}: {
  person?: PersonWithRelationships;
  companies: Company[];
  defaultCompanyId?: string;
  customFieldsSection?: React.ReactNode;
}) {
  const action = person ? updatePerson : createPerson;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );
  const initialRelationships: EditableRelationship[] =
    person?.companyRelationships?.map((relationship) => ({
      companyId: relationship.companyId,
      rolesText: relationship.roles.join(", "),
      roleTitle: relationship.roleTitle ?? "",
      isPrimary: relationship.isPrimary,
      notes: relationship.notes ?? "",
    })) ??
    (person?.companyId || defaultCompanyId
      ? [
          {
            companyId: person?.companyId ?? defaultCompanyId ?? "",
            rolesText: "contact",
            roleTitle: person?.roleTitle ?? "",
            isPrimary: true,
            notes: "",
          },
        ]
      : []);
  const [relationships, setRelationships] = useState(initialRelationships);

  const serializedRelationships = relationships.map((relationship) => ({
    companyId: relationship.companyId,
    roles: relationship.rolesText
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean),
    roleTitle: relationship.roleTitle || null,
    isPrimary: relationship.isPrimary,
    notes: relationship.notes || null,
  }));

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {person && <input type="hidden" name="id" value={person.id} />}

      <input
        type="hidden"
        name="relationshipsJson"
        value={JSON.stringify(serializedRelationships)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <section className="space-y-3 rounded-md border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Empresas relacionadas</h2>
            <p className="text-muted-foreground text-xs">
              Los roles se separan por coma. Debe existir una sola empresa
              principal.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setRelationships((current) => [
                ...current,
                {
                  companyId: "",
                  rolesText: "contact",
                  roleTitle: "",
                  isPrimary: current.length === 0,
                  notes: "",
                },
              ])
            }
          >
            Agregar empresa
          </Button>
        </div>
        {relationships.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Sin empresas relacionadas.
          </p>
        )}
        {relationships.map((relationship, index) => (
          <div
            key={`${relationship.companyId}-${index}`}
            className="grid gap-3 rounded-md border p-3 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label>Empresa</Label>
              <select
                value={relationship.companyId}
                onChange={(event) =>
                  setRelationships((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, companyId: event.target.value }
                        : item,
                    ),
                  )
                }
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
            <FieldValue
              label="Roles"
              value={relationship.rolesText}
              onChange={(value) =>
                setRelationships((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, rolesText: value } : item,
                  ),
                )
              }
            />
            <FieldValue
              label="Cargo en esta empresa"
              value={relationship.roleTitle}
              onChange={(value) =>
                setRelationships((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, roleTitle: value } : item,
                  ),
                )
              }
            />
            <div className="flex items-end justify-between gap-3 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="primaryRelationship"
                  checked={relationship.isPrimary}
                  onChange={() =>
                    setRelationships((current) =>
                      current.map((item, itemIndex) => ({
                        ...item,
                        isPrimary: itemIndex === index,
                      })),
                    )
                  }
                />
                Empresa principal
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setRelationships((current) => {
                    const next = current.filter(
                      (_, itemIndex) => itemIndex !== index,
                    );
                    if (relationship.isPrimary && next[0])
                      next[0].isPrimary = true;
                    return [...next];
                  })
                }
              >
                Quitar
              </Button>
            </div>
          </div>
        ))}
      </section>

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

function FieldValue({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
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
