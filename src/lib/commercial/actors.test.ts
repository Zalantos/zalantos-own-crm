import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actorChipLabels,
  actorColumns,
  actorHref,
  actorKey,
  actorLeadWhere,
  actorOpportunityWhere,
  opportunityRoleField,
  parseActorKey,
} from "./actors";

describe("actores comerciales", () => {
  it("serializa y valida la referencia", () => {
    const ref = { type: "partner", id: "abc" } as const;
    assert.deepEqual(parseActorKey(actorKey(ref)), ref);
    assert.equal(parseActorKey("otro:abc"), null);
    assert.equal(parseActorKey("partner:"), null);
    assert.equal(parseActorKey(undefined), null);
    assert.equal(actorHref(ref), "/partners/abc");
    assert.deepEqual(actorColumns(ref), { personId: null, companyId: null, commercialPartnerId: "abc" });
  });

  it("decisor y sponsor persona de una oportunidad no se duplican como vínculo", () => {
    const opportunity = { type: "opportunity", id: "o" } as const;
    const lead = { type: "commercial_lead", id: "l" } as const;
    const person = { type: "person", id: "p" } as const;
    const partner = { type: "partner", id: "x" } as const;
    assert.equal(opportunityRoleField(opportunity, person, "decision_maker"), "decisionMakerId");
    assert.equal(opportunityRoleField(opportunity, person, "sponsor"), "sponsorId");
    assert.equal(opportunityRoleField(opportunity, person, "referrer"), null);
    assert.equal(opportunityRoleField(opportunity, partner, "sponsor"), null);
    assert.equal(opportunityRoleField(lead, person, "decision_maker"), null);
  });

  it("el filtro por persona incluye decisor y sponsor", () => {
    assert.deepEqual(actorOpportunityWhere({ type: "person", id: "p" }), {
      OR: [
        { actorLinks: { some: { actorKey: "person:p" } } },
        { decisionMakerId: "p" },
        { sponsorId: "p" },
      ],
    });
    assert.deepEqual(actorOpportunityWhere({ type: "partner", id: "x" }), {
      actorLinks: { some: { actorKey: "partner:x" } },
    });
    assert.deepEqual(actorLeadWhere({ type: "company", id: "c" }), {
      actorLinks: { some: { actorKey: "company:c" } },
    });
  });

  it("arma etiquetas compactas", () => {
    assert.deepEqual(
      actorChipLabels([
        { id: "1", role: "referrer", person: { firstName: "Juan José", lastName: "Giachino" }, company: null, commercialPartner: null },
        { id: "2", role: "commercial_partner", person: null, company: null, commercialPartner: { displayName: "Consultora" } },
      ]),
      ["Juan José Giachino (Referidor)", "Consultora (Partner comercial)"],
    );
  });
});
