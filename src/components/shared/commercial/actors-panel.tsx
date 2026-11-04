"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  linkActorAction,
  unlinkActorAction,
  updateActorAction,
  type ActorFormState,
} from "@/app/(dashboard)/commercial/actor-actions";
import {
  ACTOR_ROLES,
  ACTOR_ROLE_LABELS,
  ACTOR_TYPE_LABELS,
  type ActorTarget,
} from "@/lib/commercial/actors";
import type { ActorPickerOptions, RecordActor } from "@/lib/commercial/actor-service";

const selectClass = "bg-background h-9 w-full rounded-md border px-2 text-sm";

function useActorForm(
  action: (prev: ActorFormState, formData: FormData) => Promise<ActorFormState>,
  onSuccess: () => void,
) {
  return useActionState<ActorFormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result && "ok" in result) {
      toast.success(result.message);
      onSuccess();
    }
    return result;
  }, undefined);
}

function RoleSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="text-muted-foreground">Rol en este negocio</span>
      <select name="role" defaultValue={defaultValue} className={selectClass}>
        {ACTOR_ROLES.map((role) => (
          <option key={role} value={role}>
            {ACTOR_ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    </label>
  );
}

function AddActorDialog({
  target,
  options,
}: {
  target: ActorTarget;
  options: ActorPickerOptions;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActorForm(linkActorAction.bind(null, target), () => setOpen(false));
  const groups = [
    { label: ACTOR_TYPE_LABELS.partner, prefix: "partner", items: options.partners },
    { label: ACTOR_TYPE_LABELS.person, prefix: "person", items: options.people },
    { label: ACTOR_TYPE_LABELS.company, prefix: "company", items: options.companies },
  ];
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Agregar actor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar actor</DialogTitle>
            <DialogDescription>
              Persona, empresa o partner que participa o influye en este negocio.
              Vincularlo no le asigna comisión.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Actor</span>
              <select name="actor" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Selecciona…
                </option>
                {groups.map((group) => (
                  <optgroup key={group.prefix} label={group.label}>
                    {group.items.map((item) => (
                      <option key={item.id} value={`${group.prefix}:${item.id}`}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <RoleSelect defaultValue="referrer" />
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Descripción (opcional)</span>
              <Textarea name="description" rows={2} placeholder="Ej.: Nos presentó al gerente de operaciones" />
            </label>
            {state && "error" in state && <p className="text-destructive text-xs">{state.error}</p>}
            <DialogFooter>
              <SubmitButton pendingText="Vinculando...">Vincular</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditActorDialog({ target, actor }: { target: ActorTarget; actor: RecordActor }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActorForm(
    updateActorAction.bind(null, target, actor.linkId as string),
    () => setOpen(false),
  );
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actor.name}</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="space-y-3">
            <RoleSelect defaultValue={actor.role} />
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">Descripción (opcional)</span>
              <Textarea name="description" rows={2} defaultValue={actor.description ?? ""} />
            </label>
            {state && "error" in state && <p className="text-destructive text-xs">{state.error}</p>}
            <DialogFooter>
              <SubmitButton pendingText="Guardando...">Guardar</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActorRow({ target, actor }: { target: ActorTarget; actor: RecordActor }) {
  const [pending, startTransition] = useTransition();
  function unlink() {
    startTransition(async () => {
      const result = await unlinkActorAction(target, actor.linkId, actor.field);
      if (result && "error" in result) toast.error(result.error);
      else if (result) toast.success(result.message);
    });
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="flex flex-wrap items-center gap-1.5">
          <Link href={actor.href} className="font-medium hover:underline">
            {actor.name}
          </Link>
          <Badge variant="outline">{actor.roleLabel}</Badge>
          <span className="text-muted-foreground text-xs">{ACTOR_TYPE_LABELS[actor.actor.type]}</span>
          {actor.economicShare && (
            <Badge variant="secondary">Participación {actor.economicShare}%</Badge>
          )}
        </p>
        {actor.detail && <p className="text-muted-foreground text-xs">{actor.detail}</p>}
        {actor.description && <p className="text-xs whitespace-pre-wrap">{actor.description}</p>}
        {actor.linkedAt && (
          <p className="text-muted-foreground text-xs">
            Vinculado el {new Date(actor.linkedAt).toISOString().slice(0, 10)}
            {actor.recordedBy ? ` por ${actor.recordedBy}` : ""}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {actor.linkId && <EditActorDialog target={target} actor={actor} />}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={unlink}>
          Desvincular
        </Button>
      </div>
    </div>
  );
}

export function ActorsPanel({
  target,
  actors,
  options,
}: {
  target: ActorTarget;
  actors: RecordActor[];
  options: ActorPickerOptions;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Actores involucrados ({actors.length})</CardTitle>
        <AddActorDialog target={target} options={options} />
      </CardHeader>
      <CardContent className="space-y-2">
        {actors.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin actores. Agrega quién refiere, intermedia o participa en este negocio.
          </p>
        ) : (
          actors.map((actor) => <ActorRow key={actor.key} target={target} actor={actor} />)
        )}
      </CardContent>
    </Card>
  );
}
