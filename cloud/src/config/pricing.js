// Default pricing rates for AI models
// All rates are in dollars per million tokens ($/1M tokens)

export const DEFAULT_PRICING = {
  // Claude Code (cc)
  cc: {
    "claude-opus-4-6": {
      input: 15.0,
      output: 25.0,
      cached: 2.5,
      reasoning: 15.0,
      cache_creation: 15.0,
    },
    "claude-sonnet-4-5-20250929": {
      input: 3.0,
      output: 15.0,
      cached: 1.5,
      reasoning: 15.0,
      cache_creation: 3.0,
    },
    "claude-haiku-4-5-20251001": {
      input: 0.5,
      output: 2.5,
      cached: 0.25,
      reasoning: 2.5,
      cache_creation: 0.5,
    },
  },
  // OpenAI Codex (cx)
  cx: {
    "gpt-5.3-codex": {
      input: 6.0,
      output: 24.0,
      cached: 3.0,
      reasoning: 36.0,
      cache_creation: 6.0,
    },
    "gpt-5.2": {
      input: 5.0,
      output: 20.0,
      cached: 2.5,
      reasoning: 30.0,
      cache_creation: 5.0,
    },
  },
  // Gemini CLI (gc)
  gc: {
    "gemini-3-pro-preview": {
      input: 2.0,
      output: 12.0,
      cached: 0.25,
      reasoning: 18.0,
      cache_creation: 2.0,
    },
    "gemini-2.5-flash": {
      input: 0.3,
      output: 2.5,
      cached: 0.03,
      reasoning: 3.75,
      cache_creation: 0.3,
    },
  },
  // Standard Providers
  openai: {
    "gpt-4o": {
      input: 2.5,
      output: 10.0,
      cached: 1.25,
      reasoning: 15.0,
      cache_creation: 2.5,
    },
    "gpt-4o-mini": {
      input: 0.15,
      output: 0.6,
      cached: 0.075,
      reasoning: 0.9,
      cache_creation: 0.15,
    },
  },
  anthropic: {
    "claude-3-5-sonnet-20241022": {
      input: 3.0,
      output: 15.0,
      cached: 1.5,
      reasoning: 15.0,
      cache_creation: 3.0,
    },
  },
  gemini: {
    "gemini-2.5-flash": {
      input: 0.3,
      output: 2.5,
      cached: 0.03,
      reasoning: 3.75,
      cache_creation: 0.3,
    },
  },
};

export function getDefaultPricing() {
  return DEFAULT_PRICING;
}
