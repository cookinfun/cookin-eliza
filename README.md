# @cookinfun/plugin-cookin

ElizaOS plugin for the [Cookin API](https://cookin.fun/api): Solana and
Pump.fun token intelligence. Your agent can ask who is behind a token before
entering, while holding, or after exiting.

Eight actions, paid per call in USDC over
[x402](https://cookin.fun/api/x402) with no account, or covered by a Cookin Pro
key.

## What it answers

- **Coordinated wallets.** Which wallets act as one group (bundles), how much
  supply they hold, and how many of those groups are heavy net sellers.
- **Holder quality.** Share of supply held by wallets that historically pick
  winners, by quick sellers, by suspicious wallets, and by wallets that nuke
  charts when they exit.
- **KOL positions.** Which tracked KOL wallets hold, and how much.
- **Wallet reputation.** One wallet's lifetime PnL, ROI, win rate, hold times,
  and smart-money classification.
- **Deployer history.** Every token a deployer launched, its bond rate, and a
  survival curve across market cap rungs.
- **Ratings.** A green, yellow, red or neutral verdict per metric, using the
  same thresholds as the Cookin UI.

## Install

```bash
elizaos plugins add @cookinfun/plugin-cookin
```

Or add it by hand:

```bash
npm install @cookinfun/plugin-cookin
```

```ts
import { cookinPlugin } from "@cookinfun/plugin-cookin";

export const character = {
  name: "Scout",
  plugins: ["@elizaos/plugin-bootstrap", cookinPlugin],
};
```

In a character file, the plugin name is enough:

```json
{
  "name": "Scout",
  "plugins": ["@elizaos/plugin-bootstrap", "@cookinfun/plugin-cookin"],
  "settings": {
    "secrets": {
      "SOLANA_KEY": "<base58 Solana keypair holding USDC>"
    }
  }
}
```

## Paying

Pick one. The mode is decided per call, from the settings the runtime holds.

| Setting | Mode | Cost |
|---|---|---|
| `SOLANA_KEY` | Pay per call with x402 | $0.01 per call, $0.02 for a full token snapshot |
| `COOKIN_API_KEY` | Cookin Pro | 1 SOL per 30 days, 600 requests per minute |
| neither | Unpaid | Every call returns 402, and the action says how to pay |

`SOLANA_KEY` is a base58-encoded 64-byte Solana keypair. It stays on the
machine the agent runs on: only a signed transaction leaves it. The wallet
needs USDC only, because the facilitator pays the network fee, and a call that
errors is never charged. Mint a Pro key at
[cookin.fun/account/api-keys](https://cookin.fun/account/api-keys).

Optional:

- `COOKIN_MAX_PAYMENT` caps what one call may pay. Default `$0.05`.
- `COOKIN_BASE_URL` points at another host. Default `https://api.cookin.fun`.

## Actions

| Action | Price | Returns |
|---|---|---|
| `COOKIN_SCAN_TOKEN` | $0.02 | Full snapshot for one mint: score, holders, bundles, KOLs, cohorts, signals, ratings |
| `COOKIN_TOKEN_TRADES` | $0.01 | Recent trades, each with the trader's history at that moment |
| `COOKIN_LIST_AGENT_BUYS` | $0.01 | The 20 most recent buys by the top Cookin agents |
| `COOKIN_LIST_NEW_TOKENS` | $0.01 | New launches that passed the rug filters |
| `COOKIN_LIST_PUMPING_TOKENS` | $0.01 | Tokens currently pumping |
| `COOKIN_LIST_GRADUATED_TOKENS` | $0.01 | Recent graduates to Raydium or PumpSwap |
| `COOKIN_PROFILE_WALLET` | $0.01 | One wallet's lifetime trading profile |
| `COOKIN_DEPLOYER_HISTORY` | $0.01 | Every token one deployer launched |

Every action is read-only. Each returns a one-line summary as its text, for the
agent's reply, and the full API body as `data`, for a later action to read.

Spend less: start with one `COOKIN_SCAN_TOKEN`, and stop if its ratings already
answer the question. Deployer history changes slowly, so it is worth
remembering.

## Reference

- Field-by-field reference: [api.cookin.fun/skill.md](https://api.cookin.fun/skill.md)
- OpenAPI spec: [api.cookin.fun/openapi.json](https://api.cookin.fun/openapi.json)
- Docs: [cookin.fun/api](https://cookin.fun/api)

The same endpoints are also available over MCP, remotely at
`https://api.cookin.fun/mcp` or locally with `npx -y @cookinfun/mcp`, and
through the [Node](https://www.npmjs.com/package/cookin-fun) and
[Python](https://pypi.org/project/cookin-fun/) SDKs.

## Development

```bash
npm install
npm test          # unit tests, no network
npm run build     # tsc to dist/
```

MIT
