// The Cookin endpoints as ElizaOS actions.
//
// Each entry declares what an agent can ask for, what it costs, and how
// to build the request path. The plugin turns these into `Action`s; the
// shared handler does the call, so an action is data rather than code.
/**
 * One declared argument. Named after ElizaOS's own parameter shape, but
 * declared here: `@elizaos/core` 1.7 does not export the type, while its
 * `Action` accepts the extra field, so newer runtimes read it and older
 * ones ignore it.
 */
export type ActionParameter = {
  name: string;
  description: string;
  required?: boolean;
};

export type ActionSpec = {
  name: string;
  description: string;
  price: string;
  similes: string[];
  parameters: ActionParameter[];
  /** Path and query for one call, from the extracted parameters. */
  request: (params: Record<string, unknown>) => string;
  /** One line summarising the answer, for the agent's reply. */
  summarise: (body: Record<string, any>) => string;
};

const MINT: ActionParameter = {
  name: "mint",
  description: "Solana token mint address, base58.",
  required: true,
};

const WALLET: ActionParameter = {
  name: "address",
  description: "Solana wallet address, base58.",
  required: true,
};

export const ACTIONS: ActionSpec[] = [
  {
    name: "COOKIN_SCAN_TOKEN",
    description:
      "Check who is behind a Solana or Pump.fun token before trading it: coordinated " +
      "wallet groups (bundles) and the supply they hold, holder quality, chart-nuker " +
      "exposure, KOL positions, and a green/yellow/red rating per metric. Use this " +
      "whenever a token needs judging, at any stage of its life.",
    price: "$0.02",
    similes: ["CHECK_TOKEN", "RUG_CHECK", "ANALYZE_TOKEN", "BUNDLE_CHECK"],
    parameters: [MINT],
    request: (params) => `/v1/tokens/${encodeURIComponent(String(params.mint))}`,
    summarise: (body) => {
      const ratings = body?.data?.ratings ?? {};
      const bundles = body?.data?.bundles ?? {};
      const score = body?.data?.score ?? {};

      return (
        `score ${score.value ?? "?"} (${ratings.score ?? "no reading"}), ` +
        `coordinated supply ${bundles.owned_pct_supply ?? "?"}% across ` +
        `${bundles.count ?? 0} groups (${ratings.bundle ?? "no reading"}), ` +
        `suspicious supply ${score.dirty_pct ?? "?"}% (${ratings.dirty ?? "no reading"})`
      );
    },
  },
  {
    name: "COOKIN_TOKEN_TRADES",
    description:
      "Recent trades for one token, each carrying the trader's history at that moment: " +
      "PnL, win rate, bundle membership, smart-money flag. Use it to see who is buying " +
      "or selling right now.",
    price: "$0.01",
    similes: ["TOKEN_TRADES", "WHO_IS_BUYING"],
    parameters: [MINT],
    request: (params) => `/v1/tokens/${encodeURIComponent(String(params.mint))}/trades`,
    summarise: (body) => `${body?.data?.length ?? 0} recent trades with trader history`,
  },
  {
    name: "COOKIN_LIST_AGENT_BUYS",
    description:
      "The 20 most recent buys by the top Cookin trading agents, newest first, each " +
      "with quality signals and when it was bought. Use it to find what proven " +
      "strategies are buying now.",
    price: "$0.01",
    similes: ["AGENT_BUYS", "WHAT_ARE_AGENTS_BUYING"],
    parameters: [],
    request: () => "/v1/tokens/agents",
    summarise: (body) => `${body?.data?.length ?? 0} recent agent buys`,
  },
  {
    name: "COOKIN_LIST_NEW_TOKENS",
    description:
      "Newly launched Pump.fun tokens that passed Cookin's rug filters, with quality " +
      "signals and ratings. Use it to find candidates worth checking.",
    price: "$0.01",
    similes: ["NEW_TOKENS", "NEW_LAUNCHES"],
    parameters: [],
    request: () => "/v1/tokens/new",
    summarise: (body) => `${body?.data?.length ?? 0} new launches past the filters`,
  },
  {
    name: "COOKIN_LIST_PUMPING_TOKENS",
    description:
      "Pump.fun tokens that are pumping right now, with quality signals, holder " +
      "behavior and ratings. Use it to find what the market is moving into.",
    price: "$0.01",
    similes: ["PUMPING_TOKENS", "WHAT_IS_PUMPING", "TRENDING_TOKENS"],
    parameters: [],
    request: () => "/v1/tokens/pumps",
    summarise: (body) => `${body?.data?.length ?? 0} tokens pumping now`,
  },
  {
    name: "COOKIN_LIST_GRADUATED_TOKENS",
    description:
      "Pump.fun tokens that recently graduated to Raydium or PumpSwap, with quality " +
      "signals and ratings. Use it to find launches that made it off the curve.",
    price: "$0.01",
    similes: ["GRADUATED_TOKENS", "RECENT_GRADUATES", "BONDED_TOKENS"],
    parameters: [],
    request: () => "/v1/tokens/graduated",
    summarise: (body) => `${body?.data?.length ?? 0} recent graduates`,
  },
  {
    name: "COOKIN_PROFILE_WALLET",
    description:
      "Lifetime trading profile of one Solana wallet: PnL, ROI, win rate, hold times, " +
      "bundle membership and smart-money flag. Use it to judge a buyer or seller you " +
      "saw in a trade list.",
    price: "$0.01",
    similes: ["WALLET_REPUTATION", "CHECK_WALLET", "TRADER_STATS"],
    parameters: [WALLET],
    request: (params) => `/v1/traders/${encodeURIComponent(String(params.address))}`,
    summarise: (body) => {
      const trader = body?.data ?? {};

      return (
        `PnL ${trader.pnl_sol ?? "?"} SOL, win rate ${trader.win_rate ?? "?"}%, ` +
        `smart money ${trader.smart_money ? "yes" : "no"}, ` +
        `bundled trades ${trader.bundled_trades_rate ?? "?"}%`
      );
    },
  },
  {
    name: "COOKIN_DEPLOYER_HISTORY",
    description:
      "Every token one deployer has launched, with bond rate, peak market caps and a " +
      "survival curve. Use it to judge whether a dev has ever shipped anything that " +
      "worked. The answer changes slowly, so it is worth remembering.",
    price: "$0.01",
    similes: ["DEV_HISTORY", "DEPLOYER_CHECK", "WHO_IS_THE_DEV"],
    parameters: [
      { ...WALLET, description: "Deployer wallet address, base58." },
      {
        name: "limit",
        description: "Tokens to return, 1 to 100. Defaults to 50.",
        required: false,
      },
    ],
    request: (params) => {
      const query = params.limit ? `?limit=${encodeURIComponent(String(params.limit))}` : "";
      return `/v1/devs/${encodeURIComponent(String(params.address))}/tokens${query}`;
    },
    summarise: (body) => {
      const summary = body?.summary ?? {};

      return (
        `${summary.total_deployed ?? "?"} launches, ` +
        `${summary.bond_rate ?? "?"}% graduated, ` +
        `best peak ${summary.best_ath_mcap ?? "none"} USD, ` +
        `median peak ${summary.ath_mcap_percentiles?.p50 ?? "none"} USD`
      );
    },
  },
];
