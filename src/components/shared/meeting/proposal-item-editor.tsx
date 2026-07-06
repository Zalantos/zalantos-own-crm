"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
} from "@/lib/zod/opportunity";
import { updateItemValue } from "@/app/(dashboard)/meetings/proposal-actions";
import type { ReviewItem } from "@/components/shared/meeting/change-proposal-review";

const NUMBER_FIELDS = new Set([
  "probability",
  "painScore",
  "icpScore",
  "fitScore",
  "estimatedValue",
]);
const DATE_FIELDS = new Set(["nextStepDueDate", "expectedCloseDate"]);
const BOOLEAN_FIELDS = new Set(["isDecisionMaker", "isSponsor"]);

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

// ISO datetime → yyyy-MM-dd for <input type="date">.
function toDateInput(value: unknown): string {
  const s = str(value);
  return s ? s.slice(0, 10) : "";
}

export function ProposalItemEditor({
  item,
  meetingId,
  onDone,
}: {
  item: ReviewItem;
  meetingId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...asObj(item.afterValue),
  }));

  function set(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const result = await updateItemValue(item.id, meetingId, draft);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cambio actualizado y aprobado");
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="bg-muted/40 space-y-2 rounded-md border p-3">
      <EditorFields item={item} draft={draft} set={set} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Cancelar
        </Button>
        <Button size="sm" disabled={pending} onClick={save}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

function EditorFields({
  item,
  draft,
  set,
}: {
  item: ReviewItem;
  draft: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
}) {
  switch (item.type) {
    case "update_field": {
      const field = str(draft.field);
      if (BOOLEAN_FIELDS.has(field)) {
        return (
          <Field label={field}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(draft.value)}
                onChange={(e) => set("value", e.target.checked)}
              />
              Sí
            </label>
          </Field>
        );
      }
      if (field === "stage") {
        return (
          <Field label="Etapa">
            <StageSelectInput
              value={str(draft.value)}
              onChange={(v) => set("value", v)}
            />
          </Field>
        );
      }
      return (
        <Field label={field}>
          <Input
            type={
              DATE_FIELDS.has(field)
                ? "date"
                : NUMBER_FIELDS.has(field)
                  ? "number"
                  : "text"
            }
            value={DATE_FIELDS.has(field) ? toDateInput(draft.value) : str(draft.value)}
            onChange={(e) => set("value", e.target.value)}
          />
        </Field>
      );
    }

    case "update_pain":
      return (
        <Field label="Dolor principal">
          <Textarea
            value={str(draft.value)}
            rows={3}
            onChange={(e) => set("value", e.target.value)}
          />
        </Field>
      );

    case "stage_change":
      return (
        <Field label="Nueva etapa">
          <StageSelectInput
            value={str(draft.value)}
            onChange={(v) => set("value", v)}
          />
        </Field>
      );

    case "update_next_step":
      return (
        <>
          <Field label="Próximo paso">
            <Textarea
              value={str(draft.nextStep)}
              rows={2}
              onChange={(e) => set("nextStep", e.target.value)}
            />
          </Field>
          <Field label="Vencimiento">
            <Input
              type="date"
              value={toDateInput(draft.nextStepDueDate)}
              onChange={(e) => set("nextStepDueDate", e.target.value || null)}
            />
          </Field>
        </>
      );

    case "create_task":
      return (
        <>
          <Field label="Título">
            <Input
              value={str(draft.title)}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              value={str(draft.description)}
              rows={2}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field label="Vence en (días)">
            <Input
              type="number"
              min={0}
              value={str(draft.dueInDays)}
              onChange={(e) => set("dueInDays", e.target.value)}
            />
          </Field>
        </>
      );

    case "add_note":
      return (
        <>
          <Field label="Título">
            <Input
              value={str(draft.title)}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Nota">
            <Textarea
              value={str(draft.body)}
              rows={4}
              onChange={(e) => set("body", e.target.value)}
            />
          </Field>
        </>
      );

    case "add_contact":
      return (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Nombre">
              <Input
                value={str(draft.firstName)}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </Field>
            <Field label="Apellido">
              <Input
                value={str(draft.lastName)}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={str(draft.email)}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={str(draft.phone)}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Cargo">
              <Input
                value={str(draft.roleTitle)}
                onChange={(e) => set("roleTitle", e.target.value)}
              />
            </Field>
            <Field label="LinkedIn">
              <Input
                value={str(draft.linkedinUrl)}
                onChange={(e) => set("linkedinUrl", e.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(draft.isDecisionMaker)}
                onChange={(e) => set("isDecisionMaker", e.target.checked)}
              />
              Decisor
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(draft.isSponsor)}
                onChange={(e) => set("isSponsor", e.target.checked)}
              />
              Sponsor
            </label>
          </div>
        </>
      );

    default:
      return (
        <p className="text-muted-foreground text-sm">
          Este tipo de cambio no se puede editar.
        </p>
      );
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children}
    </div>
  );
}

function StageSelectInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-background h-9 w-full rounded-md border px-3 text-sm"
    >
      {OPPORTUNITY_STAGES.map((stage) => (
        <option key={stage} value={stage}>
          {OPPORTUNITY_STAGE_LABELS[stage]}
        </option>
      ))}
    </select>
  );
}
