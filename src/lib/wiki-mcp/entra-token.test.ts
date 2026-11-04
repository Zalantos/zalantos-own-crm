import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEntraTokenProvider } from "./entra-token";
import { WikiMcpError } from "./errors";

const settings = {
  tenantId: "tenant-1",
  clientId: "client-1",
  clientSecret: "s3cret-value",
  resource: "api://wiki-api",
  timeoutMs: 1_000,
};

function tokenResponse(token: string, expiresIn = 3600) {
  return Response.json({ access_token: token, expires_in: expiresIn });
}

function counting(respond: (call: number) => Response | Promise<Response>) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: new URLSearchParams(init?.body as URLSearchParams),
    });
    return respond(calls.length);
  };
  return { calls, fetchImpl };
}

describe("Entra: client credentials", () => {
  it("pide {resource}/.default y nunca el rol como scope", async () => {
    const { calls, fetchImpl } = counting(() => tokenResponse("t1"));
    const provider = createEntraTokenProvider({ settings, fetchImpl });

    assert.equal(await provider.getToken(), "t1");
    assert.equal(
      calls[0].url,
      "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token",
    );
    assert.equal(calls[0].body.get("grant_type"), "client_credentials");
    assert.equal(calls[0].body.get("scope"), "api://wiki-api/.default");
  });

  it("cachea el token y comparte una sola solicitud concurrente", async () => {
    const { calls, fetchImpl } = counting(() => tokenResponse("t1"));
    const provider = createEntraTokenProvider({ settings, fetchImpl });

    const tokens = await Promise.all([
      provider.getToken(),
      provider.getToken(),
      provider.getToken(),
    ]);
    assert.deepEqual(tokens, ["t1", "t1", "t1"]);
    await provider.getToken();
    assert.equal(calls.length, 1);
  });

  it("renueva antes de caducar según expires_in", async () => {
    let now = 0;
    const { calls, fetchImpl } = counting((call) => tokenResponse(`t${call}`));
    const provider = createEntraTokenProvider({
      settings,
      fetchImpl,
      now: () => now,
    });

    assert.equal(await provider.getToken(), "t1");
    now = 3_530_000;
    assert.equal(await provider.getToken(), "t1");
    now = 3_545_000;
    assert.equal(await provider.getToken(), "t2");
    assert.equal(calls.length, 2);
  });

  it("invalidate solo descarta el token que falló", async () => {
    const { calls, fetchImpl } = counting((call) => tokenResponse(`t${call}`));
    const provider = createEntraTokenProvider({ settings, fetchImpl });

    await provider.getToken();
    provider.invalidate("otro");
    assert.equal(await provider.getToken(), "t1");
    provider.invalidate("t1");
    assert.equal(await provider.getToken(), "t2");
    assert.equal(calls.length, 2);
  });

  it("credenciales rechazadas: unauthorized, sin filtrar la respuesta ni el secreto", async () => {
    const { fetchImpl } = counting(() =>
      Response.json(
        { error: "invalid_client", error_description: "AADSTS7000215 secreto" },
        { status: 401 },
      ),
    );
    const provider = createEntraTokenProvider({ settings, fetchImpl });

    await assert.rejects(provider.getToken(), (error: WikiMcpError) => {
      assert.equal(error.kind, "unauthorized");
      assert.equal(error.message.includes("AADSTS"), false);
      assert.equal(error.message.includes(settings.clientSecret), false);
      return true;
    });
  });

  it("Entra caída o respuesta malformada no se confunde con credenciales", async () => {
    const down = createEntraTokenProvider({
      settings,
      fetchImpl: counting(() => new Response("", { status: 503 })).fetchImpl,
    });
    await assert.rejects(down.getToken(), { kind: "unavailable" });

    const offline = createEntraTokenProvider({
      settings,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await assert.rejects(offline.getToken(), { kind: "unavailable" });

    const malformed = createEntraTokenProvider({
      settings,
      fetchImpl: counting(() => Response.json({ nope: true })).fetchImpl,
    });
    await assert.rejects(malformed.getToken(), { kind: "invalid_response" });
  });

  it("un fallo no queda cacheado", async () => {
    const { fetchImpl } = counting((call) =>
      call === 1 ? new Response("", { status: 503 }) : tokenResponse("t2"),
    );
    const provider = createEntraTokenProvider({ settings, fetchImpl });

    await assert.rejects(provider.getToken());
    assert.equal(await provider.getToken(), "t2");
  });
});
