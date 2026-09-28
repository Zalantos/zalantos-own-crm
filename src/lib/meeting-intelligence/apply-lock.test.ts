import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TenantClient } from "@/lib/tenant";
import { claimProposalForApply } from "./apply";

type ProposalState = {
  status: string;
  applyStartedAt: Date | null;
  items: { status: string }[];
};

function createProposalDb(initial: ProposalState) {
  let state = { ...initial, items: [...initial.items] };
  const db = {
    cRMChangeProposal: {
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          status: string;
          applyStartedAt?: { lt: Date };
        };
        data: { status?: string; applyStartedAt?: Date };
      }) => {
        const timestampMatches =
          !where.applyStartedAt ||
          (state.applyStartedAt != null &&
            state.applyStartedAt < where.applyStartedAt.lt);
        if (state.status !== where.status || !timestampMatches) {
          return { count: 0 };
        }
        state = {
          ...state,
          status: data.status ?? state.status,
          applyStartedAt: data.applyStartedAt ?? state.applyStartedAt,
        };
        return { count: 1 };
      },
      findUnique: async () => ({
        status: state.status,
        applyStartedAt: state.applyStartedAt,
        items: state.items,
      }),
    },
  } as unknown as TenantClient;
  return { db, state: () => state };
}

describe("proposal apply lock", () => {
  it("allows only one concurrent claimant", async () => {
    const { db } = createProposalDb({
      status: "pending",
      applyStartedAt: null,
      items: [],
    });

    const results = await Promise.allSettled([
      claimProposalForApply(db, "proposal-1"),
      claimProposalForApply(db, "proposal-1"),
    ]);

    assert.equal(
      results.filter(
        (result) => result.status === "fulfilled" && result.value === null,
      ).length,
      1,
    );
    const rejection = results.find((result) => result.status === "rejected");
    assert.ok(rejection && rejection.status === "rejected");
    assert.match(String(rejection.reason), /ya se está aplicando/);
  });

  it("reclaims a lock older than two minutes", async () => {
    const oldTimestamp = new Date(Date.now() - 3 * 60 * 1000);
    const { db, state } = createProposalDb({
      status: "applying",
      applyStartedAt: oldTimestamp,
      items: [],
    });

    assert.equal(await claimProposalForApply(db, "proposal-1"), null);
    assert.ok(
      (state().applyStartedAt?.getTime() ?? 0) > oldTimestamp.getTime(),
    );
  });

  it("returns the persisted result for a closed proposal", async () => {
    const { db } = createProposalDb({
      status: "partially_approved",
      applyStartedAt: null,
      items: [
        { status: "applied" },
        { status: "applied" },
        { status: "failed" },
        { status: "rejected" },
      ],
    });

    assert.deepEqual(await claimProposalForApply(db, "proposal-1"), {
      applied: 2,
      failed: 1,
    });
  });
});
