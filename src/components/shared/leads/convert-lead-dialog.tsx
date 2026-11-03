"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  convertInboundLead,
  type ConvertLeadFormState,
} from "@/app/(dashboard)/leads/actions";

export type CompanyMatch = { id: string; name: string };
export type PersonMatch = { id: string; label: string };

export function ConvertLeadDialog({
  leadId,
  suggestedOpportunityName,
  matchingCompanies,
  defaultCompanyName,
  matchingPeople = [],
  open,
  onOpenChange,
}: {
  leadId: string;
  suggestedOpportunityName: string;
  matchingCompanies: CompanyMatch[];
  defaultCompanyName: string;
  matchingPeople?: PersonMatch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ConvertLeadFormState, FormData>(
    convertInboundLead,
    undefined,
  );
  const [companyId, setCompanyId] = useState(
    matchingCompanies[0]?.id ?? "",
  );
  const [mode, setMode] = useState<"lead" | "opportunity">("lead");

  useEffect(() => {
    if (state && "success" in state && state.success) {
      onOpenChange(false);
      router.push(
        state.opportunityId
          ? `/opportunities/${state.opportunityId}`
          : `/prospecting/${state.commercialLeadId}`,
      );
    }
  }, [state, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Incorporar al proceso comercial</DialogTitle>
          <DialogDescription>
            Vincula una empresa y persona (existentes o nuevas), crea el lead
            con el origen recibido y, si ya hay un proyecto concreto, la
            oportunidad en Discovery.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={leadId} />
          <input type="hidden" name="mode" value={mode} />

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "lead" ? "default" : "outline"}
              onClick={() => setMode("lead")}
            >
              Solo lead
            </Button>
            <Button
              type="button"
              variant={mode === "opportunity" ? "default" : "outline"}
              onClick={() => setMode("opportunity")}
            >
              Lead + oportunidad
            </Button>
          </div>

          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Empresa</label>
            {matchingCompanies.length > 0 && (
              <select
                name="companyId"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                className="bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {matchingCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
                <option value="">+ Crear empresa nueva</option>
              </select>
            )}
            {companyId === "" && (
              <Input
                name="companyName"
                defaultValue={defaultCompanyName}
                placeholder="Nombre de la nueva empresa"
                required={matchingCompanies.length === 0}
              />
            )}
          </div>

          {matchingPeople.length > 0 && (
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Persona</label>
              <select
                name="personId"
                defaultValue={matchingPeople[0]?.id ?? ""}
                className="bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {matchingPeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
                <option value="">+ Usar/crear según los datos del formulario</option>
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">
              Interés o necesidad manifestada
            </label>
            <Textarea
              name="interestSignal"
              rows={2}
              placeholder="Opcional: si se omite se usa el mensaje original"
            />
          </div>

          {mode === "opportunity" && (
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                Nombre de la oportunidad
              </label>
              <Input
                name="opportunityName"
                defaultValue={suggestedOpportunityName}
                required
              />
            </div>
          )}

          {state && "error" in state && (
            <p className="text-destructive text-xs">{state.error}</p>
          )}

          <DialogFooter>
            <SubmitButton pendingText="Incorporando...">
              {mode === "lead" ? "Crear lead" : "Crear lead y oportunidad"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
