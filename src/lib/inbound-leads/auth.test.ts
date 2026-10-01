import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAuthorized,
  isCronSecretConfigured,
} from "@/lib/meeting-intelligence/internal-auth";

// authorizeInboundLeadRequest (./auth.ts) delega el chequeo del secret en
// estos dos helpers (mismos que Telegram/crons); se testean directo para no
// depender de env vars ni de prismaSystem en el test.
describe("inbound leads secret check", () => {
  const secret = "a-real-secret-value-1234";

  it("rejects a missing or malformed secret", () => {
    assert.equal(isCronSecretConfigured(undefined), false);
    assert.equal(isCronSecretConfigured("short"), false);
    assert.equal(isCronSecretConfigured("changeme"), false);
  });

  it("rejects a request with no Authorization header", () => {
    assert.equal(isAuthorized(null, secret), false);
  });

  it("rejects a request with the wrong secret", () => {
    assert.equal(isAuthorized("Bearer wrong-secret-value", secret), false);
  });

  it("accepts a request with the correct Bearer secret", () => {
    assert.equal(isAuthorized(`Bearer ${secret}`, secret), true);
  });
});
