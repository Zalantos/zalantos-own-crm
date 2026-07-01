// Shared, type-only form state used across the meetings action files
// (actions.ts, evidence-actions.ts). No "use server" here on purpose — this
// file has zero runtime weight and is erased at compile time.
export type FormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;
