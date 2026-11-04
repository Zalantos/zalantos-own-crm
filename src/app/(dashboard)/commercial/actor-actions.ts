"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import {
  clearOpportunityRoleFieldTx,
  linkActorTx,
  unlinkActorTx,
  updateActorLinkTx,
  type ActorFieldName,
} from "@/lib/commercial/actor-service";
import { isActorRole, parseActorKey, type ActorTarget } from "@/lib/commercial/actors";

export type ActorFormState = { error: string } | { ok: true; message: string } | undefined;

function pathFor(target: ActorTarget) {
  return target.type === "opportunity" ? `/opportunities/${target.id}` : `/prospecting/${target.id}`;
}

function refresh(target: ActorTarget) {
  revalidatePath(pathFor(target));
  revalidatePath("/opportunities");
  revalidatePath("/prospecting");
  revalidatePath("/partners");
}

function failure(error: unknown, fallback: string): ActorFormState {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function linkActorAction(
  target: ActorTarget,
  _prev: ActorFormState,
  formData: FormData,
): Promise<ActorFormState> {
  const { user, org } = await requireOrgContext();
  const actor = parseActorKey(String(formData.get("actor") ?? ""));
  const role = formData.get("role");
  const description = String(formData.get("description") ?? "");
  if (!actor) return { error: "Selecciona un actor." };
  if (!isActorRole(role)) return { error: "Selecciona un rol." };
  try {
    await withOrgTransaction(org.id, (tx) =>
      linkActorTx(
        tx,
        { organizationId: org.id, userId: user.id, source: "manual" },
        { target, actor, role, description },
      ),
    );
  } catch (error) {
    return failure(error, "No se pudo vincular el actor.");
  }
  refresh(target);
  return { ok: true, message: "Actor vinculado." };
}

export async function updateActorAction(
  target: ActorTarget,
  linkId: string,
  _prev: ActorFormState,
  formData: FormData,
): Promise<ActorFormState> {
  const { user, org } = await requireOrgContext();
  const role = formData.get("role");
  if (!isActorRole(role)) return { error: "Selecciona un rol." };
  try {
    await withOrgTransaction(org.id, (tx) =>
      updateActorLinkTx(
        tx,
        { organizationId: org.id, userId: user.id, source: "manual" },
        linkId,
        { role, description: String(formData.get("description") ?? "") },
      ),
    );
  } catch (error) {
    return failure(error, "No se pudo actualizar el actor.");
  }
  refresh(target);
  return { ok: true, message: "Participación actualizada." };
}

export async function unlinkActorAction(
  target: ActorTarget,
  linkId: string | null,
  field: ActorFieldName | null,
): Promise<ActorFormState> {
  const { user, org } = await requireOrgContext();
  const ctx = { organizationId: org.id, userId: user.id, source: "manual" };
  try {
    await withOrgTransaction(org.id, async (tx) => {
      if (linkId) await unlinkActorTx(tx, ctx, linkId);
      else if (field && target.type === "opportunity") {
        await clearOpportunityRoleFieldTx(tx, ctx, target.id, field);
      }
    });
  } catch (error) {
    return failure(error, "No se pudo desvincular el actor.");
  }
  refresh(target);
  return { ok: true, message: "Actor desvinculado." };
}
