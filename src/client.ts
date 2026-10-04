// How a call reaches the Cookin API, and how it gets paid for.
//
// Three modes, read from the agent's settings at call time:
//
//   * COOKIN_API_KEY set: a Pro key goes out as a Bearer token.
//   * SOLANA_KEY set: every call is paid per request with x402 (USDC on
//     Solana). The key never leaves the machine the agent runs on; only
//     a signed transaction does, and the facilitator pays the network
//     fee. A call that errors is never charged.
//   * neither: calls go out unpaid, every one returns 402, and the error
//     text says how to pay. That is more useful to an agent than a
//     silent failure.
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

const DEFAULT_BASE_URL = "https://api.cookin.fun";

// Refuses to sign anything above this per call, so a misread price or a
// changed offer cannot drain the agent's wallet. The dearest route today
// is the $0.02 snapshot.
const DEFAULT_MAX_PAYMENT = "$0.05";

/**
 * Whatever the host uses to hand plugins their settings. The runtime's
 * own `getSetting` answers more than strings, so values are narrowed
 * here rather than trusted.
 */
export type SettingsReader = {
  getSetting(key: string): string | boolean | number | null | undefined;
};

export type PaymentMode = "pro-key" | "x402" | "unpaid";

export type CookinResponse = { mode: PaymentMode; body: unknown };

/** Calls `path` and returns the parsed body. Throws on failure. */
export async function get(
  settings: SettingsReader,
  path: string,
): Promise<CookinResponse> {
  const baseUrl = text(settings, "COOKIN_BASE_URL") ?? DEFAULT_BASE_URL;
  const apiKey = text(settings, "COOKIN_API_KEY");
  const solanaKey = text(settings, "SOLANA_KEY");

  if (apiKey) {
    const body = await request(baseUrl + path, fetch, {
      Authorization: `Bearer ${apiKey}`,
    });
    return { mode: "pro-key", body };
  }

  if (solanaKey) {
    const maxPayment = text(settings, "COOKIN_MAX_PAYMENT") ?? DEFAULT_MAX_PAYMENT;
    const payingFetch = await payingFetchFor(solanaKey, maxPayment);

    return { mode: "x402", body: await request(baseUrl + path, payingFetch) };
  }

  return { mode: "unpaid", body: await request(baseUrl + path, fetch) };
}

// ----------------------------------------------------------------
// Internals
// ----------------------------------------------------------------

// Deriving the signer and registering the payment scheme is the same
// work on every call, so the wrapped fetch is built once per key and
// spend limit. An agent that changes either gets a fresh one.
const payingFetches = new Map<string, typeof fetch>();

async function payingFetchFor(solanaKey: string, maxPayment: string): Promise<typeof fetch> {
  const cacheKey = `${solanaKey}|${maxPayment}`;
  const cached = payingFetches.get(cacheKey);

  if (cached) return cached;

  const client = new x402Client();
  client.setSpendControls({ maxAmountPerPayment: maxPayment });
  registerExactSvmScheme(client, {
    signer: await createKeyPairSignerFromBytes(base58.decode(solanaKey)),
  });

  const payingFetch = wrapFetchWithPayment(fetch, client);
  payingFetches.set(cacheKey, payingFetch);

  return payingFetch;
}

// A setting is only useful here when it is a non-empty string: an empty
// key would otherwise send an `Authorization: Bearer ` header and turn a
// clear 402 into a confusing 401.
function text(settings: SettingsReader, key: string): string | undefined {
  const value = settings.getSetting(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

async function request(
  url: string,
  fetchImpl: typeof fetch,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetchImpl(url, { headers });
  const body = await response.text();

  if (response.ok) return JSON.parse(body);

  throw new Error(failureMessage(response.status, body));
}

// The API answers every failure with the same envelope, so an agent sees
// Cookin's own wording, plus what to do next when it is a 402.
function failureMessage(status: number, body: string): string {
  let message = body.slice(0, 400);

  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.message) message = parsed.error.message;
  } catch {
    // Not JSON (a proxy error page, say). The raw body is the best hint.
  }

  if (status === 402) {
    return (
      `${message} Set SOLANA_KEY to a base58 Solana keypair holding USDC to pay ` +
      `per call, or COOKIN_API_KEY to a Cookin Pro key from ` +
      `https://cookin.fun/account/api-keys`
    );
  }

  return `Cookin API returned ${status}: ${message}`;
}
