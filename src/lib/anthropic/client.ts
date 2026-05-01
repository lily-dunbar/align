import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export function getAnthropicApiKey(): string | undefined {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key || undefined;
}

/**
 * Server-side Anthropic client. Requires `ANTHROPIC_API_KEY` in the environment.
 * Use in Route Handlers / Server Actions only.
 */
export function getAnthropicClient(): Anthropic {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

/** Same as {@link getAnthropicClient} when the key is configured; otherwise `null`. */
export function getAnthropicClientOrNull(): Anthropic | null {
  const apiKey = getAnthropicApiKey();
  return apiKey ? new Anthropic({ apiKey }) : null;
}
