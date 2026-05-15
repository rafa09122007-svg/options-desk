import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY env var. Set it in Vercel.");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model identifiers — change here if Anthropic releases new versions
export const MODELS = {
  SCREENER: "claude-haiku-4-5-20251001",
  ANALYST: "claude-opus-4-7",
} as const;
