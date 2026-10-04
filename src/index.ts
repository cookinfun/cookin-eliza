// ElizaOS plugin for the Cookin API.
//
// Gives an agent eight read-only actions about Solana and Pump.fun
// tokens: scan a token, read its recent trades, list new launches,
// what is pumping and what graduated, see what the top Cookin agents
// just bought, profile a wallet, and check a deployer's record.
//
// Paying is the agent's own business: set `SOLANA_KEY` and it pays per
// call in USDC over x402, or set `COOKIN_API_KEY` and a Pro
// subscription covers it. With neither, every action returns the price
// and how to pay rather than failing silently.
import type { Action, ActionResult, IAgentRuntime, Plugin } from "@elizaos/core";
import { ACTIONS, type ActionSpec } from "./actions.js";
import { get, type SettingsReader } from "./client.js";

export { ACTIONS } from "./actions.js";
export type { ActionSpec } from "./actions.js";

/** Builds one ElizaOS action from a Cookin endpoint. */
export function toAction(spec: ActionSpec): Action {
  return {
    name: spec.name,
    description: `${spec.description} Costs ${spec.price} per call.`,
    similes: spec.similes,
    parameters: spec.parameters,
    // Read-only and side-effect free, so there is nothing to validate
    // beyond the parameters the runtime already extracted.
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      _message: unknown,
      _state: unknown,
      options: unknown,
    ): Promise<ActionResult> => {
      const params = extractParameters(options);
      const missing = spec.parameters.find(
        (parameter) => parameter.required && !params[parameter.name],
      );

      if (missing) {
        return {
          success: false,
          text: `${spec.name} needs a ${missing.name}: ${missing.description}`,
        };
      }

      try {
        const { body } = await get(runtime as unknown as SettingsReader, spec.request(params));

        return {
          success: true,
          text: spec.summarise(body as Record<string, unknown>),
          data: body as Record<string, unknown>,
        };
      } catch (error) {
        return { success: false, text: (error as Error).message };
      }
    },
    examples: [],
  };
}

// The runtime passes extracted parameters on `options.parameters`, and
// older hosts pass them as the options object itself. Accept both so the
// plugin works across versions.
function extractParameters(options: unknown): Record<string, unknown> {
  const bag = (options ?? {}) as Record<string, unknown>;
  const parameters = bag.parameters;

  return (parameters && typeof parameters === "object" ? parameters : bag) as Record<
    string,
    unknown
  >;
}

export const cookinPlugin: Plugin = {
  name: "cookin",
  description:
    "Solana and Pump.fun token intelligence: coordinated wallets, holder quality, " +
    "KOL positions, wallet reputation and deployer history. Paid per call in USDC " +
    "over x402, or with a Cookin Pro key.",
  actions: ACTIONS.map(toAction),
};

export default cookinPlugin;
