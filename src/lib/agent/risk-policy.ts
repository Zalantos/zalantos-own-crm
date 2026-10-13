// Risk classification per tool. Every currently exposed mutation is
// non-destructive and executes immediately through the change ledger. Future
// delete/merge tools must use "proposal" and set requiresApproval on items.

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
  assign_task: "auto",
  complete_task: "auto",
  update_record_fields: "auto",
  change_stage: "auto",
  create_contact: "auto",
  create_opportunity: "auto",
  create_company: "auto",
};
