"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  ClipboardListIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LinkifiedText } from "@/components/shared/linkified-text";
import { cn } from "@/lib/utils";
import {
  applyAgentProposal,
  getAgentProposalState,
  rejectAgentProposal,
  revertAgentItem,
  setAgentItemApproval,
} from "@/app/(dashboard)/agent/proposal-actions";

type ProposalToolOutput = {
  status?: string;
  proposalId?: string;
  items?: {
    id: string;
    label: string;
    before: string;
    after: string;
    explanation: string;
    evidence?: string | null;
    confidence?: number;
    approved?: boolean;
  }[];
  error?: string;
};

type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const CLOSED_LABELS: Record<string, string> = {
  applied: "Aplicada",
  partially_approved: "Aplicada parcialmente",
  rejected: "Rechazada",
};

// Inline review card for an agent-generated CRMChangeProposal. The tool output
// stored in the message is a snapshot; live status is re-read on mount so
// reopening an old thread renders "Aplicada" instead of active buttons.
export function AgentProposalCard({ part }: { part: ToolPart }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const output = (part.output ?? {}) as ProposalToolOutput;
  const proposalId = output.proposalId;

  const [status, setStatus] = useState<string>("pending");
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [itemStatus, setItemStatus] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  function syncState(state: {
    status: string;
    items: { id: string; approved: boolean; status: string }[];
  }) {
    setStatus(state.status);
    setApprovals(
      Object.fromEntries(state.items.map((item) => [item.id, item.approved])),
    );
    setItemStatus(
      Object.fromEntries(state.items.map((item) => [item.id, item.status])),
    );
  }

  useEffect(() => {
    if (!proposalId) return;
    let cancelled = false;
    getAgentProposalState(proposalId)
      .then((state) => {
        if (cancelled) return;
        syncState(state);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
        <Loader2Icon className="size-3 animate-spin" />
        Preparando propuesta…
      </div>
    );
  }

  const errorText =
    part.state === "output-error" ? (part.errorText ?? "Error") : output.error;
  if (errorText || !proposalId) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700">
        <CircleAlertIcon className="size-3" />
        <span className="max-w-72 truncate">
          No se pudo crear la propuesta: {errorText ?? "sin datos"}
        </span>
      </div>
    );
  }

  const items = output.items ?? [];
  const closed = status in CLOSED_LABELS;
  const approvedCount = Object.values(approvals).filter(Boolean).length;

  function toggleItem(itemId: string, approved: boolean) {
    if (!proposalId) return;
    setApprovals((current) => ({ ...current, [itemId]: approved }));
    startTransition(async () => {
      try {
        await setAgentItemApproval(proposalId, itemId, approved);
      } catch {
        setApprovals((current) => ({ ...current, [itemId]: !approved }));
        toast.error("No se pudo actualizar el cambio");
      }
    });
  }

  function apply() {
    if (!proposalId) return;
    startTransition(async () => {
      try {
        const result = await applyAgentProposal(proposalId);
        syncState(await getAgentProposalState(proposalId));
        if (result.failed > 0) {
          toast.warning(
            `${result.applied} cambio(s) aplicado(s), ${result.failed} fallido(s)`,
          );
        } else {
          toast.success(`${result.applied} cambio(s) aplicado(s)`);
        }
        router.refresh();
      } catch {
        toast.error("No se pudo aplicar la propuesta");
      }
    });
  }

  function reject() {
    if (!proposalId) return;
    startTransition(async () => {
      try {
        await rejectAgentProposal(proposalId);
        setStatus("rejected");
      } catch {
        toast.error("No se pudo rechazar la propuesta");
      }
    });
  }

  function revert(itemId: string) {
    if (!proposalId) return;
    startTransition(async () => {
      try {
        const res = await revertAgentItem(proposalId, itemId);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        syncState(await getAgentProposalState(proposalId));
        toast.success("Cambio deshecho");
        router.refresh();
      } catch {
        toast.error("No se pudo deshacer el cambio");
      }
    });
  }

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
        <ClipboardListIcon className="size-3.5" />
        Propuesta de cambios
        {closed && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5",
              status === "rejected"
                ? "bg-muted text-muted-foreground"
                : "bg-emerald-100 text-emerald-700",
            )}
          >
            {status !== "rejected" && <CheckCircle2Icon className="size-3" />}
            {CLOSED_LABELS[status]}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-xs">
            {!closed && (
              <Checkbox
                checked={approvals[item.id] ?? item.approved ?? false}
                onCheckedChange={(checked) =>
                  toggleItem(item.id, checked === true)
                }
                disabled={pending || !loaded}
                className="mt-0.5"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                {item.label}
                {typeof item.confidence === "number" && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-normal",
                      item.confidence >= 0.8
                        ? "bg-emerald-100 text-emerald-700"
                        : item.confidence >= 0.5
                          ? "bg-amber-100 text-amber-700"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {Math.round(item.confidence * 100)}%
                  </span>
                )}
              </p>
              <p className="text-muted-foreground flex flex-wrap items-center gap-1">
                <span className="line-through decoration-1">
                  <LinkifiedText text={item.before} />
                </span>
                <ArrowRightIcon className="size-3 shrink-0" />
                <span className="text-foreground">
                  <LinkifiedText text={item.after} />
                </span>
              </p>
              {item.explanation && (
                <p className="text-muted-foreground mt-0.5">
                  <LinkifiedText text={item.explanation} />
                </p>
              )}
              {item.evidence && (
                <p className="text-muted-foreground mt-0.5 border-l-2 pl-2 italic">
                  “<LinkifiedText text={item.evidence} />”
                </p>
              )}
            </div>
            {itemStatus[item.id] === "applied" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-xs"
                onClick={() => revert(item.id)}
                disabled={pending || !loaded}
              >
                Deshacer
              </Button>
            )}
            {itemStatus[item.id] === "reverted" && (
              <span className="text-muted-foreground shrink-0 text-[10px]">
                Deshecho
              </span>
            )}
          </div>
        ))}
      </div>

      {!closed && (
        <div className="bg-muted/30 flex items-center justify-end gap-2 border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reject}
            disabled={pending || !loaded}
          >
            Rechazar
          </Button>
          <Button
            size="sm"
            onClick={apply}
            disabled={pending || !loaded || approvedCount === 0}
          >
            {pending && <Loader2Icon className="size-3 animate-spin" />}
            Aplicar {approvedCount > 0 ? `(${approvedCount})` : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
