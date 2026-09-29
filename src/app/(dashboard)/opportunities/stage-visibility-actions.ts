"use server";

import { cookies } from "next/headers";
import { requireOrgContext } from "@/lib/tenant";
import { getOrgStages } from "@/lib/pipeline/stages";
import {
  HIDDEN_STAGES_COOKIE,
  HIDDEN_STAGES_MAX_AGE_SECONDS,
} from "@/lib/opportunities/hidden-stages";

export async function setHiddenOpportunityStages(stageIds: string[]) {
  const { db } = await requireOrgContext();
  const stages = await getOrgStages(db);
  const known = new Set(stages.map((stage) => stage.id));
  const ids = stageIds.filter((id) => known.has(id));
  const store = await cookies();
  store.set(HIDDEN_STAGES_COOKIE, JSON.stringify(ids), {
    path: "/",
    maxAge: HIDDEN_STAGES_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
  });
}
