import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertInboundLeadSchema,
  inboundLeadPayloadSchema,
} from "./inbound-lead";

describe("inboundLeadPayloadSchema", () => {
  it("accepts a minimal valid n8n payload", () => {
    const parsed = inboundLeadPayloadSchema.parse({
      source: "website_contact",
      external_id: "row-123",
      first_name: "Tomás",
      last_name: "Rodríguez",
      email: "tomas@empresa.cl",
      company: "Empresa SpA",
      message: "Queremos automatizar...",
      page: "/contacto",
    });
    assert.equal(parsed.source, "website_contact");
    assert.equal(parsed.external_id, "row-123");
  });

  it("rejects a payload without source or external_id", () => {
    assert.throws(() =>
      inboundLeadPayloadSchema.parse({ first_name: "Tomás" }),
    );
  });

  it("treats empty optional strings as absent", () => {
    const parsed = inboundLeadPayloadSchema.parse({
      source: "website_contact",
      external_id: "row-123",
      company: "",
      message: "",
    });
    assert.equal(parsed.company, undefined);
    assert.equal(parsed.message, undefined);
  });

  it("rejects a malformed email", () => {
    assert.throws(() =>
      inboundLeadPayloadSchema.parse({
        source: "website_contact",
        external_id: "row-123",
        email: "not-an-email",
      }),
    );
  });
});

describe("convertInboundLeadSchema", () => {
  it("requires an opportunity name", () => {
    assert.throws(() =>
      convertInboundLeadSchema.parse({ id: "lead-1", opportunityName: "" }),
    );
  });

  it("accepts either an existing companyId or a new companyName", () => {
    const withExisting = convertInboundLeadSchema.parse({
      id: "lead-1",
      companyId: "company-1",
      opportunityName: "Acme · Inbound",
    });
    assert.equal(withExisting.companyId, "company-1");

    const withNew = convertInboundLeadSchema.parse({
      id: "lead-1",
      companyName: "Acme Mining",
      opportunityName: "Acme · Inbound",
    });
    assert.equal(withNew.companyId, undefined);
    assert.equal(withNew.companyName, "Acme Mining");
  });
});
