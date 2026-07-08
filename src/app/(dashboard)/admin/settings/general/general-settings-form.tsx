"use client";

import { useActionState } from "react";
import type { Organization } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { updateOrgSettings, type SettingsFormState } from "./actions";

const LOCALES = [
  { value: "es-CL", label: "Español (Chile)" },
  { value: "es-MX", label: "Español (México)" },
  { value: "es-AR", label: "Español (Argentina)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "en-US", label: "English (US)" },
];

const TIMEZONES = [
  "America/Santiago",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Lima",
  "Europe/Madrid",
  "America/New_York",
];

export function GeneralSettingsForm({ org }: { org: Organization }) {
  const [state, formAction] = useActionState<SettingsFormState, FormData>(
    updateOrgSettings,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-md border p-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre de la organización</Label>
        <Input id="name" name="name" defaultValue={org.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="brandName">Nombre para mostrar (opcional)</Label>
        <Input
          id="brandName"
          name="brandName"
          defaultValue={org.brandName ?? ""}
          placeholder={org.name}
        />
        <p className="text-muted-foreground text-xs">
          Se usa en el sidebar y en los emails. Si lo dejás vacío, se usa el
          nombre de la organización.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="currency">Moneda (ISO 4217)</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={org.currency}
            maxLength={3}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="accentColor">Color de acento</Label>
          <Input
            id="accentColor"
            name="accentColor"
            type="color"
            defaultValue={org.accentColor}
            className="h-9 w-14 p-1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Zona horaria</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={org.timezone}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="locale">Idioma / formato</Label>
          <select
            id="locale"
            name="locale"
            defaultValue={org.locale}
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {LOCALES.map((locale) => (
              <option key={locale.value} value={locale.value}>
                {locale.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-muted-foreground text-sm">{state.success}</p>
      )}

      <SubmitButton>Guardar cambios</SubmitButton>
    </form>
  );
}
