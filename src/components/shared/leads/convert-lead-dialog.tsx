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
import { SubmitButton } from "@/components/shared/submit-button";
import {
  convertInboundLead,
  type ConvertLeadFormState,
} from "@/app/(dashboard)/leads/actions";

export type CompanyMatch = { id: string; name: string };

export function ConvertLeadDialog({
  leadId,
  suggestedOpportunityName,
  matchingCompanies,
  defaultCompanyName,
  open,
  onOpenChange,
}: {
  leadId: string;
  suggestedOpportunityName: string;
  matchingCompanies: CompanyMatch[];
  defaultCompanyName: string;
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

  useEffect(() => {
    if (state && "success" in state && state.success) {
      onOpenChange(false);
      router.push(`/opportunities/${state.opportunityId}`);
    }
  }, [state, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convertir a CRM</DialogTitle>
          <DialogDescription>
            Crea o vincula una empresa, reutiliza el contacto si ya existe y
            genera la oportunidad inicial.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={leadId} />

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

          {state && "error" in state && (
            <p className="text-destructive text-xs">{state.error}</p>
          )}

          <DialogFooter>
            <SubmitButton pendingText="Convirtiendo...">
              Convertir a CRM
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
