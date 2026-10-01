"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  ConvertLeadDialog,
  type CompanyMatch,
} from "@/components/shared/leads/convert-lead-dialog";
import { markLeadReviewed, discardLead } from "@/app/(dashboard)/leads/actions";

export function LeadActions({
  leadId,
  status,
  suggestedOpportunityName,
  matchingCompanies,
  defaultCompanyName,
}: {
  leadId: string;
  status: string;
  suggestedOpportunityName: string;
  matchingCompanies: CompanyMatch[];
  defaultCompanyName: string;
}) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (status === "converted") return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status !== "rejected" && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm("¿Descartar este lead?")) return;
              startTransition(() => {
                void discardLead(leadId);
              });
            }}
          >
            Descartar
          </Button>
        )}
        {status === "new" && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => startTransition(() => void markLeadReviewed(leadId))}
          >
            Marcar revisado
          </Button>
        )}
        <Button type="button" onClick={() => setConvertOpen(true)}>
          Convertir a CRM
        </Button>
      </div>

      <ConvertLeadDialog
        leadId={leadId}
        suggestedOpportunityName={suggestedOpportunityName}
        matchingCompanies={matchingCompanies}
        defaultCompanyName={defaultCompanyName}
        open={convertOpen}
        onOpenChange={setConvertOpen}
      />
    </>
  );
}
