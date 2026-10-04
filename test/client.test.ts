// Covers how a call is paid for and how a failure reads. No request
// leaves the machine: a local HTTP server stands in for the API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, type Server } from "node:http";
import { get, type SettingsReader } from "../src/client.js";

let server: Server;
let baseUrl: string;
let lastRequest: { url?: string; authorization?: string } = {};

// The runtime hands plugins their settings through `getSetting`, and it
// answers more than strings, so a fake that returns the raw value is
// closer to the real thing than a plain map.
function settings(values: Record<string, string | boolean | number>): SettingsReader {
  return { getSetting: (key) => values[key] };
}

before(async () => {
  server = createHttpServer((req, res) => {
    lastRequest = { url: req.url, authorization: req.headers.authorization };

    if (req.url?.startsWith("/paywalled")) {
      res.writeHead(402, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "payment_required", message: "Pay up." } }));
      return;
    }

    if (req.url?.startsWith("/broken")) {
      res.writeHead(500, { "content-type": "text/html" });
      res.end("<html>nope</html>");
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: { ok: true }, meta: { request_id: "abc" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

after(() => server.close());

test("a Pro key is sent as a Bearer token and nothing is paid per call", async () => {
  const { mode, body } = await get(
    settings({ COOKIN_BASE_URL: baseUrl, COOKIN_API_KEY: "sk_test" }),
    "/v1/tokens/abc",
  );

  assert.equal(mode, "pro-key");
  assert.deepEqual(body, { data: { ok: true }, meta: { request_id: "abc" } });
  assert.equal(lastRequest.authorization, "Bearer sk_test");
  assert.equal(lastRequest.url, "/v1/tokens/abc");
});

test("with no key and no wallet, calls go out unpaid", async () => {
  const { mode } = await get(settings({ COOKIN_BASE_URL: baseUrl }), "/v1/tokens/abc");

  assert.equal(mode, "unpaid");
  assert.equal(lastRequest.authorization, undefined);
});

test("a setting that is not a usable string is treated as absent", async () => {
  // An empty key would otherwise send `Authorization: Bearer ` and turn
  // a clear 402 into a confusing 401.
  const { mode } = await get(
    settings({ COOKIN_BASE_URL: baseUrl, COOKIN_API_KEY: "", SOLANA_KEY: false }),
    "/v1/tokens/abc",
  );

  assert.equal(mode, "unpaid");
  assert.equal(lastRequest.authorization, undefined);
});

test("a 402 explains both ways to pay", async () => {
  await assert.rejects(get(settings({ COOKIN_BASE_URL: baseUrl }), "/paywalled"), (error: Error) => {
    assert.match(error.message, /Pay up\./);
    assert.match(error.message, /SOLANA_KEY/);
    assert.match(error.message, /COOKIN_API_KEY/);
    return true;
  });
});

test("a non-JSON failure still reports its status", async () => {
  await assert.rejects(get(settings({ COOKIN_BASE_URL: baseUrl }), "/broken"), /returned 500/);
});

test("a Solana key switches the call to paying per call", async () => {
  // A throwaway keypair, generated here so no real key is involved. The
  // paid path reaches the same local server, so this proves the wiring
  // without touching the chain.
  const { generateKeyPairSync } = await import("node:crypto");
  const { base58 } = await import("@scure/base");

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);

  const { mode } = await get(
    settings({
      COOKIN_BASE_URL: baseUrl,
      SOLANA_KEY: base58.encode(new Uint8Array([...seed, ...pub])),
    }),
    "/v1/tokens/abc",
  );

  assert.equal(mode, "x402");
});
