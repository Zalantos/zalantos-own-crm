// Autonomy policy for AI change proposals. Only high-confidence items are
// pre-approved (born ticked); everything else requires an explicit review
// tick, so a miscalibrated or uncertain model errs on the cautious side.
// Single knob for now; can move to a per-org column later without touching
// the call sites.
export const PROPOSAL_AUTOAPPROVE_THRESHOLD = 0.8;

export function shouldAutoApprove(confidence: number): boolean {
  return confidence >= PROPOSAL_AUTOAPPROVE_THRESHOLD;
}

// Approval flags derived from a confidence score, matching the CRMChangeItem
// shape (approved boolean + status string) used at both creation sites.
export function approvalFromConfidence(confidence: number): {
  approved: boolean;
  status: "approved" | "pending";
} {
  const approved = shouldAutoApprove(confidence);
  return { approved, status: approved ? "approved" : "pending" };
}
