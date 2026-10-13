import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TenantClient } from "@/lib/tenant";
import {
  RevertConflictError,
  preflightRevertItem,
  revertProposal,
} from "./apply";

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    organizationId: "org-1",
    proposalId: "proposal-1",
    type: "update_field",
    entity: "company",
    entityId: "company-1",
    beforeValue: { field: "name", value: "Antes" },
    afterValue: { field: "name", value: "Después" },
    appliedSnapshot: { field: "name", value: "Después" },
    approved: true,
    requiresApproval: false,
    sequence: 0,
    status: "applied",
    appliedAt: new Date("2026-01-01T00:00:00Z"),
    undoExpiresAt: new Date("2026-04-01T00:00:00Z"),
    failureCode: null,
    failureMessage: null,
    revertData: null,
    revertedAt: null,
    revertedBy: null,
    causedByItemId: null,
    proposal: { id: "proposal-1", status: "applied" },
    ...overrides,
  };
}

describe("reversión segura", () => {
  it("bloquea un cambio cuyo plazo de 90 días venció", async () => {
    const db = {
      cRMChangeItem: { findFirst: async () => item() },
    } as unknown as TenantClient;

    await assert.rejects(
      () => preflightRevertItem(db, "org-1", "item-1"),
      (error: unknown) =>
        error instanceof RevertConflictError && error.code === "undo_expired",
    );
  });

  it("considera idempotente un ítem ya deshecho", async () => {
    const db = {
      cRMChangeItem: {
        findFirst: async () => item({ status: "reverted" }),
      },
    } as unknown as TenantClient;

    await preflightRevertItem(db, "org-1", "item-1");
  });

  it("prevalida todo el lote antes de iniciar una reversión", async () => {
    let updateCalls = 0;
    const db = {
      cRMChangeProposal: {
        findFirst: async () => ({
          id: "proposal-1",
          items: [
            { id: "expired", status: "applied" },
            { id: "valid", status: "applied" },
          ],
        }),
        update: async () => {
          updateCalls += 1;
        },
      },
      cRMChangeItem: {
        findFirst: async ({ where }: { where: { id: string } }) =>
          item({
            id: where.id,
            undoExpiresAt:
              where.id === "expired"
                ? new Date("2026-04-01T00:00:00Z")
                : new Date("2099-01-01T00:00:00Z"),
          }),
      },
    } as unknown as TenantClient;

    await assert.rejects(
      () => revertProposal(db, "org-1", "proposal-1", "user-1"),
      RevertConflictError,
    );
    assert.equal(updateCalls, 0);
  });
});
