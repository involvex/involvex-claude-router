import { AntigravityExecutor } from "./antigravity.js";
import { GeminiCLIExecutor } from "./gemini-cli.js";
import { DefaultExecutor } from "./default.js";
import { GithubExecutor } from "./github.js";
import { CursorExecutor } from "./cursor.js";
import { IFlowExecutor } from "./iflow.js";
import { CodexExecutor } from "./codex.js";
import { KiroExecutor } from "./kiro.js";

const executors = {
  antigravity: new AntigravityExecutor(),
  "gemini-cli": new GeminiCLIExecutor(),
  github: new GithubExecutor(),
  iflow: new IFlowExecutor(),
  kiro: new KiroExecutor(),
  codex: new CodexExecutor(),
  cursor: new CursorExecutor(),
  cu: new CursorExecutor(), // Alias for cursor
};

const defaultCache = new Map();

export function getExecutor(provider) {
  if (executors[provider]) return executors[provider];
  if (!defaultCache.has(provider))
    defaultCache.set(provider, new DefaultExecutor(provider));
  return defaultCache.get(provider);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[provider];
}

export { BaseExecutor } from "./base.js";
export { AntigravityExecutor } from "./antigravity.js";
export { GeminiCLIExecutor } from "./gemini-cli.js";
export { GithubExecutor } from "./github.js";
export { IFlowExecutor } from "./iflow.js";
export { KiroExecutor } from "./kiro.js";
export { CodexExecutor } from "./codex.js";
export { CursorExecutor } from "./cursor.js";
export { DefaultExecutor } from "./default.js";
