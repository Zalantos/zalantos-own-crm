import { cookies } from "next/headers";
import {
  HIDDEN_STAGES_COOKIE,
  parseHiddenStageIds,
} from "@/lib/opportunities/hidden-stages";

export async function readHiddenStageIds(): Promise<string[]> {
  const store = await cookies();
  return parseHiddenStageIds(store.get(HIDDEN_STAGES_COOKIE)?.value);
}
