"use client";

import type { UIMessage } from "ai";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkifiedText } from "@/components/shared/linkified-text";
import { AgentProposalCard } from "./agent-proposal-card";

const TOOL_LABELS: Record<string, string> = {
  "tool-search_crm": "Buscó en el CRM",
  "tool-get_record": "Consultó un registro",
  "tool-get_company_snapshot": "Analizó la empresa",
  "tool-list_writable_fields": "Consultó los campos disponibles",
  "tool-read_attachment": "Leyó el documento adjunto",
  "tool-create_note": "Creó una nota",
  "tool-create_task": "Creó una tarea",
  "tool-create_opportunity": "Propuso crear una oportunidad",
  "tool-create_company": "Propuso crear una empresa",
};

const PROPOSAL_TOOLS = new Set([
  "tool-update_record_fields",
  "tool-change_stage",
  "tool-create_contact",
  "tool-create_opportunity",
  "tool-create_company",
]);

// create_note/create_task solo son "tarjeta de propuesta" cuando el turno los
// movió a una propuesta (ver registerProposalChange); si escribieron directo,
// siguen siendo un ToolChip común.
const NOTE_TASK_TOOLS = new Set(["tool-create_note", "tool-create_task"]);

type ToolPart = {
  type: string;
  toolCallId: string;
  state:
    "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function proposalIdOf(part: ToolPart): string | null {
  if (part.state !== "output-available") return null;
  if (!part.output || typeof part.output !== "object") return null;
  const { proposalId } = part.output as { proposalId?: unknown };
  return typeof proposalId === "string" ? proposalId : null;
}

function toolOutputError(part: ToolPart): string | null {
  if (part.state === "output-error") return part.errorText ?? "Error";
  if (
    part.state === "output-available" &&
    part.output &&
    typeof part.output === "object" &&
    "error" in part.output
  ) {
    return String((part.output as { error: unknown }).error);
  }
  return null;
}

function ToolChip({ part }: { part: ToolPart }) {
  const label = TOOL_LABELS[part.type] ?? part.type.replace(/^tool-/, "");
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const error = toolOutputError(part);

  return (
    <div
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        error && "border-amber-300 text-amber-700",
      )}
    >
      {running ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : error ? (
        <CircleAlertIcon className="size-3" />
      ) : part.type.startsWith("tool-create_") ? (
        <CheckCircle2Icon className="size-3 text-emerald-600" />
      ) : (
        <SearchIcon className="size-3" />
      )}
      <span>{label}</span>
      {error && <span className="max-w-56 truncate">· {error}</span>}
    </div>
  );
}

// Un turno con 2+ cambios puede generar varios tool-calls (nota, tarea,
// cambio de etapa...) que terminan en la MISMA CRMChangeProposal. Cada uno
// trae solo su propio recorte de items; para no mostrar varias tarjetas
// parciales del mismo proposalId, se renderiza una sola vez — en el último
// tool-call que lo referencia, porque appendItemsToProposal devuelve la
// lista completa de items en ese punto.
function lastIndexByProposalId(parts: readonly { type: string }[]) {
  const lastIndex = new Map<string, number>();
  parts.forEach((part, index) => {
    if (!PROPOSAL_TOOLS.has(part.type) && !NOTE_TASK_TOOLS.has(part.type)) {
      return;
    }
    const proposalId = proposalIdOf(part as unknown as ToolPart);
    if (proposalId) lastIndex.set(proposalId, index);
  });
  return lastIndex;
}

export function MessageParts({ message }: { message: UIMessage }) {
  const lastProposalIndex = lastIndexByProposalId(message.parts);

  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          if (!part.text.trim()) return null;
          return (
            <div key={index} className="whitespace-pre-wrap">
              <LinkifiedText text={part.text} />
            </div>
          );
        }

        const toolPart = part as unknown as ToolPart;
        const proposalId = proposalIdOf(toolPart);

        if (PROPOSAL_TOOLS.has(part.type) || (NOTE_TASK_TOOLS.has(part.type) && proposalId)) {
          // Tool-call de una propuesta ya superada por otra más adelante en
          // el mismo turno: no renderiza nada, la tarjeta completa aparece
          // en el último tool-call que comparte ese proposalId.
          if (proposalId && lastProposalIndex.get(proposalId) !== index) {
            return null;
          }
          return (
            <AgentProposalCard
              key={toolPart.toolCallId ?? index}
              part={toolPart}
            />
          );
        }

        if (part.type.startsWith("tool-")) {
          return (
            <ToolChip key={toolPart.toolCallId ?? index} part={toolPart} />
          );
        }

        return null;
      })}
    </div>
  );
}
