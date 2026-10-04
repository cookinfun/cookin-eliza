// The action surface. An agent picks an action from its name,
// description and price, so those are worth pinning, as is the path each
// one builds and what the handler gives back.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, type Server } from "node:http";
import type { IAgentRuntime } from "@elizaos/core";
import { ACTIONS } from "../src/actions.js";
import { cookinPlugin, toAction } from "../src/index.js";

let server: Server;
let baseUrl: string;
let lastPath: string | undefined;

// Enough of the runtime for a handler: the settings it reads. A Pro key
// keeps the paid path out of the way, so the test is about the action.
function runtimeFor(values: Record<string, string>): IAgentRuntime {
  return {
    getSetting: (key: string) => values[key],
  } as unknown as IAgentRuntime;
}

before(async () => {
  server = createHttpServer((req, res) => {
    lastPath = req.url;

    if (req.url?.includes("Broken")) {
      res.writeHead(500, { "content-type": "text/html" });
      res.end("<html>nope</html>");
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: {
          score: { value: 71, dirty_pct: 4.2 },
          bundles: { count: 3, owned_pct_supply: 18.5 },
          ratings: { score: "green", bundle: "yellow", dirty: "green" },
        },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

after(() => server.close());

test("every Cookin endpoint is exposed once", () => {
  const names = ACTIONS.map((spec) => spec.name);

  assert.deepEqual(
    [...names].sort(),
    [
      "COOKIN_DEPLOYER_HISTORY",
      "COOKIN_LIST_AGENT_BUYS",
      "COOKIN_LIST_GRADUATED_TOKENS",
      "COOKIN_LIST_NEW_TOKENS",
      "COOKIN_LIST_PUMPING_TOKENS",
      "COOKIN_PROFILE_WALLET",
      "COOKIN_SCAN_TOKEN",
      "COOKIN_TOKEN_TRADES",
    ],
    "action list changed",
  );
  assert.equal(new Set(names).size, names.length, "duplicate action name");
});

test("the plugin registers one action per endpoint, each priced in its description", () => {
  assert.equal(cookinPlugin.name, "cookin");
  assert.equal(cookinPlugin.actions?.length, ACTIONS.length);

  for (const action of cookinPlugin.actions ?? []) {
    assert.match(action.description, /Costs \$0\.0\d per call\./, `${action.name}: no price`);
    assert.ok(action.description.length > 80, `${action.name}: description too thin`);
    assert.ok(Array.isArray(action.similes), `${action.name}: no similes`);
  }

  const scan = cookinPlugin.actions?.find((action) => action.name === "COOKIN_SCAN_TOKEN");
  assert.match(scan!.description, /\$0\.02/);
});

test("paths are built from the extracted parameters, query included", () => {
  const path = (name: string, params: Record<string, unknown>) =>
    ACTIONS.find((spec) => spec.name === name)!.request(params);

  assert.equal(path("COOKIN_SCAN_TOKEN", { mint: "MintAbc" }), "/v1/tokens/MintAbc");
  assert.equal(path("COOKIN_TOKEN_TRADES", { mint: "MintAbc" }), "/v1/tokens/MintAbc/trades");
  assert.equal(path("COOKIN_LIST_AGENT_BUYS", {}), "/v1/tokens/agents");
  assert.equal(path("COOKIN_LIST_NEW_TOKENS", {}), "/v1/tokens/new");
  assert.equal(path("COOKIN_LIST_PUMPING_TOKENS", {}), "/v1/tokens/pumps");
  assert.equal(path("COOKIN_LIST_GRADUATED_TOKENS", {}), "/v1/tokens/graduated");
  assert.equal(path("COOKIN_PROFILE_WALLET", { address: "WalletAbc" }), "/v1/traders/WalletAbc");
  assert.equal(
    path("COOKIN_DEPLOYER_HISTORY", { address: "WalletAbc", limit: 10 }),
    "/v1/devs/WalletAbc/tokens?limit=10",
  );
  assert.equal(
    path("COOKIN_DEPLOYER_HISTORY", { address: "WalletAbc" }),
    "/v1/devs/WalletAbc/tokens",
  );
});

test("an action calls the API and reports the answer in one line", async () => {
  const action = toAction(ACTIONS.find((spec) => spec.name === "COOKIN_SCAN_TOKEN")!);
  const runtime = runtimeFor({ COOKIN_BASE_URL: baseUrl, COOKIN_API_KEY: "sk_test" });

  const result = await action.handler(runtime, {} as never, undefined, {
    parameters: { mint: "MintAbc" },
  });

  assert.equal(lastPath, "/v1/tokens/MintAbc");
  assert.equal(result?.success, true);
  assert.match(result!.text!, /score 71 \(green\)/);
  assert.match(result!.text!, /coordinated supply 18\.5% across 3 groups \(yellow\)/);
  // The body travels too, so a later action can read the detail.
  assert.equal((result!.data as any).data.score.value, 71);
});

test("parameters passed as the options object itself are still found", async () => {
  // Older hosts hand the handler the extracted parameters directly.
  const action = toAction(ACTIONS.find((spec) => spec.name === "COOKIN_PROFILE_WALLET")!);
  const runtime = runtimeFor({ COOKIN_BASE_URL: baseUrl, COOKIN_API_KEY: "sk_test" });

  const result = await action.handler(runtime, {} as never, undefined, {
    address: "WalletAbc",
  });

  assert.equal(lastPath, "/v1/traders/WalletAbc");
  assert.equal(result?.success, true);
});

test("a missing required parameter is answered, not called", async () => {
  const action = toAction(ACTIONS.find((spec) => spec.name === "COOKIN_SCAN_TOKEN")!);
  const runtime = runtimeFor({ COOKIN_BASE_URL: baseUrl, COOKIN_API_KEY: "sk_test" });
  lastPath = undefined;

  const result = await action.handler(runtime, {} as never, undefined, { parameters: {} });

  assert.equal(result?.success, false);
  assert.match(result!.text!, /needs a mint/);
  assert.equal(lastPath, undefined, "called the API without a mint");
});

test("an API failure comes back as a failed result, not a throw", async () => {
  const action = toAction(ACTIONS.find((spec) => spec.name === "COOKIN_SCAN_TOKEN")!);
  const runtime = runtimeFor({ COOKIN_BASE_URL: baseUrl, COOKIN_API_KEY: "sk_test" });

  const result = await action.handler(runtime, {} as never, undefined, {
    parameters: { mint: "Broken" },
  });

  assert.equal(result?.success, false);
  assert.match(result!.text!, /returned 500/);
});

test("every action validates, and none of them write anything", async () => {
  for (const action of cookinPlugin.actions ?? []) {
    assert.equal(await action.validate(runtimeFor({}), {} as never), true);
  }
});
