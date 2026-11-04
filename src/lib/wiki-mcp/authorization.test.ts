import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { authorizeWikiAccess, isWikiEnabledForOrg } from "./authorization";

const request = { organizationId: "org-zalantos", userId: "u1", channel: "web" };

const activeUser = {
  isActive: true,
  role: "MEMBER" as const,
  organizationId: "org-zalantos",
  organization: { isActive: true },
};

describe("Wiki: autorización multi-tenant", () => {
  const previous = process.env.WIKI_MCP_ALLOWED_ORG_IDS;
  beforeEach(() => {
    process.env.WIKI_MCP_ALLOWED_ORG_IDS = "org-zalantos";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.WIKI_MCP_ALLOWED_ORG_IDS;
    else process.env.WIKI_MCP_ALLOWED_ORG_IDS = previous;
  });

  it("sin lista configurada queda apagada para todas las organizaciones", () => {
    delete process.env.WIKI_MCP_ALLOWED_ORG_IDS;
    assert.equal(isWikiEnabledForOrg("org-zalantos"), false);
    process.env.WIKI_MCP_ALLOWED_ORG_IDS = " , ";
    assert.equal(isWikiEnabledForOrg(""), false);
  });

  it("permite a un usuario activo de la organización autorizada", async () => {
    await authorizeWikiAccess(request, async () => activeUser);
    await authorizeWikiAccess(
      { ...request, channel: "telegram" },
      async () => activeUser,
    );
  });

  it("rechaza otro tenant sin consultar la base", async () => {
    let queried = false;
    await assert.rejects(
      authorizeWikiAccess(
        { ...request, organizationId: "org-cliente" },
        async () => {
          queried = true;
          return activeUser;
        },
      ),
      { kind: "access_denied" },
    );
    assert.equal(queried, false);
  });

  it("rechaza el canal MCP público aunque la organización esté autorizada", async () => {
    await assert.rejects(
      authorizeWikiAccess({ ...request, channel: "mcp" }, async () => activeUser),
      { kind: "access_denied" },
    );
  });

  it("no confía en el organizationId de la petición: valida la pertenencia", async () => {
    await assert.rejects(
      authorizeWikiAccess(request, async () => ({
        ...activeUser,
        organizationId: "org-cliente",
      })),
      { kind: "access_denied" },
    );
  });

  it("rechaza usuarios u organizaciones desactivados o inexistentes", async () => {
    const denied = { kind: "access_denied" };
    await assert.rejects(authorizeWikiAccess(request, async () => null), denied);
    await assert.rejects(
      authorizeWikiAccess(request, async () => ({
        ...activeUser,
        isActive: false,
      })),
      denied,
    );
    await assert.rejects(
      authorizeWikiAccess(request, async () => ({
        ...activeUser,
        organization: { isActive: false },
      })),
      denied,
    );
  });
});
