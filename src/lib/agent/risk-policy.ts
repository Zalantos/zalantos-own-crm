// Risk classification per tool. "auto" executes immediately; "proposal" tools
// can only create a reviewable CRMChangeProposal (enforced by construction in
// executor.ts — proposal tools contain no direct-write code). Exported as a
// plain const so it can be swapped for a DB-backed policy later.

export type ToolRisk = "auto" | "proposal";

export const TOOL_RISK: Record<string, ToolRisk> = {
  search_crm: "auto",
  get_record: "auto",
  get_company_snapshot: "auto",
  list_writable_fields: "auto",
  read_attachment: "auto",
  create_note: "auto",
  create_task: "auto",
  update_record_fields: "proposal",
  change_stage: "proposal",
  create_contact: "proposal",
};
