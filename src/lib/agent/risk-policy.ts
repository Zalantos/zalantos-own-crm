// Risk classification per tool. "auto" ejecuta al instante — excepto
// create_note/create_task/create_activity/create_meeting/update_task/
// complete_task, que solo escriben directo si son el único cambio
// del turno; a partir del segundo cambio, caen en la misma CRMChangeProposal
// que las "proposal" (ver registerProposalChange en proposals.ts). "proposal"
// tools can only create a reviewable CRMChangeProposal (enforced by
// construction in executor.ts — they contain no direct-write code). Exported
// as a plain const so it can be swapped for a DB-backed policy later.

export type ToolRisk = "auto" | "proposal";

export const TOOL_RISK: Record<string, ToolRisk> = {
  search_crm: "auto",
  get_record: "auto",
  get_company_snapshot: "auto",
  list_writable_fields: "auto",
  query_opportunities: "auto",
  find_inactive_opportunities: "auto",
  get_record_timeline: "auto",
  get_my_agenda: "auto",
  list_meetings: "auto",
  get_meeting: "auto",
  read_meeting_transcript: "auto",
  list_pending_proposals: "auto",
  read_attachment: "auto",
  read_context_source: "auto",
  list_tasks: "auto",
  create_note: "auto",
  create_task: "auto",
  create_activity: "auto",
  create_meeting: "auto",
  update_task: "auto",
  complete_task: "auto",
  update_record_fields: "proposal",
  change_stage: "proposal",
  create_contact: "proposal",
  create_opportunity: "proposal",
  create_company: "proposal",
};
