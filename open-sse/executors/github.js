import { openaiResponsesToOpenAIResponse } from "../translator/response/openai-responses.js";
import { openaiToOpenAIResponsesRequest } from "../translator/request/openai-responses.js";
import {
  PROVIDERS,
  OAUTH_ENDPOINTS,
  HTTP_STATUS,
} from "../config/constants.js";
import { parseSSELine, formatSSE } from "../utils/streamHelpers.js";
import { initState } from "../translator/index.js";
import { BaseExecutor } from "./base.js";
import crypto from "crypto";

export class GithubExecutor extends BaseExecutor {
  constructor() {
    super("github", PROVIDERS.github);
    this.knownCodexModels = new Set();
  }

  buildUrl(model, stream, urlIndex = 0) {
    return this.config.baseUrl;
  }

  buildHeaders(credentials, stream = true) {
    const token = credentials.copilotToken || credentials.accessToken;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "copilot-integration-id": "vscode-chat",
      "editor-version": "vscode/1.107.1",
      "editor-plugin-version": "copilot-chat/0.26.7",
      "user-agent": "GitHubCopilotChat/0.26.7",
      "openai-intent": "conversation-panel",
      "x-github-api-version": "2025-04-01",
      "x-request-id":
        crypto.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      "x-vscode-user-agent-library-version": "electron-fetch",
      "X-Initiator": "user",
      Accept: stream ? "text/event-stream" : "application/json",
    };
  }

  /**
   * Sanitize tools array to comply with GitHub Copilot API limits:
   *   - Max 128 tools
   *   - Function names: start with letter/underscore, max 64 chars, only a-z A-Z 0-9 _ . : -
   *   - Deduplicate by function name (keep first occurrence)
   */
  sanitizeTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return tools;

    const MAX_TOOLS = 128;
    const MAX_NAME_LENGTH = 64;
    // GitHub name rules: start with letter/underscore, then a-z A-Z 0-9 _ . : -
    const nameRegex = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

    const seen = new Set();
    const out = [];

    for (const tool of tools) {
      if (out.length >= MAX_TOOLS) break;

      if (tool.type === "function" && tool.function) {
        let name = String(tool.function.name || "").trim();

        // Truncate overly long names to 64 chars
        if (name.length > MAX_NAME_LENGTH) {
          console.warn(
            `[GithubExecutor] Truncating tool name "${name}" (${name.length} chars) to ${MAX_NAME_LENGTH}`,
          );
          name = name.slice(0, MAX_NAME_LENGTH);
        }

        // Drop tools with invalid names
        if (!nameRegex.test(name)) {
          console.warn(
            `[GithubExecutor] Dropping tool with invalid name: "${name}"`,
          );
          continue;
        }

        // Deduplicate by name
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);

        out.push(
          name !== tool.function.name
            ? { ...tool, function: { ...tool.function, name } }
            : tool,
        );
      } else {
        // Non-function tools forwarded as-is
        out.push(tool);
      }
    }

    if (tools.length !== out.length) {
      console.warn(
        `[GithubExecutor] sanitizeTools: ${tools.length} -> ${out.length} tools`,
      );
    }

    return out;
  }

  transformRequest(model, body, stream, credentials) {
    if (!body?.tools?.length) return body;
    return { ...body, tools: this.sanitizeTools(body.tools) };
  }

  async execute(options) {
    const { model, log } = options;

    // Sanitize tools early so both /chat/completions and /responses paths receive clean data
    const sanitizedOptions = options.body?.tools?.length
      ? {
          ...options,
          body: this.transformRequest(
            model,
            options.body,
            options.stream,
            options.credentials,
          ),
        }
      : options;

    if (this.knownCodexModels.has(model)) {
      log?.debug("GITHUB", `Using cached /responses route for ${model}`);
      return this.executeWithResponsesEndpoint(sanitizedOptions);
    }

    const result = await super.execute(sanitizedOptions);

    if (result.response.status === HTTP_STATUS.BAD_REQUEST) {
      const errorBody = await result.response.clone().text();

      if (
        errorBody.includes("not accessible via the /chat/completions endpoint")
      ) {
        log?.warn("GITHUB", `Model ${model} requires /responses. Switching...`);
        this.knownCodexModels.add(model);
        return this.executeWithResponsesEndpoint(sanitizedOptions);
      }
    }

    return result;
  }

  async executeWithResponsesEndpoint({
    model,
    body,
    stream,
    credentials,
    signal,
    log,
  }) {
    const url = this.config.responsesUrl;
    const headers = this.buildHeaders(credentials, stream);

    const transformedBody = openaiToOpenAIResponsesRequest(
      model,
      body,
      stream,
      credentials,
    );

    log?.debug("GITHUB", "Sending translated request to /responses");

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(transformedBody),
      signal,
    });

    if (!response.ok) {
      return { response, url, headers, transformedBody };
    }

    const state = initState("openai-responses");
    state.model = model;

    const decoder = new TextDecoder();
    let buffer = "";

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");

        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const parsed = parseSSELine(trimmed);
          if (!parsed) continue;

          if (parsed.done) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            continue;
          }

          const converted = openaiResponsesToOpenAIResponse(parsed, state);
          if (converted) {
            const sseString = formatSSE(converted, "openai");
            controller.enqueue(new TextEncoder().encode(sseString));
          }
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          const parsed = parseSSELine(buffer.trim());
          if (parsed && !parsed.done) {
            const converted = openaiResponsesToOpenAIResponse(parsed, state);
            if (converted) {
              controller.enqueue(
                new TextEncoder().encode(formatSSE(converted, "openai")),
              );
            }
          }
        }
      },
    });

    const convertedStream = response.body.pipeThrough(transformStream);

    return {
      response: new Response(convertedStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      url,
      headers,
      transformedBody,
    };
  }

  async refreshCopilotToken(githubAccessToken, log) {
    try {
      const response = await fetch(
        "https://api.github.com/copilot_internal/v2/token",
        {
          headers: {
            Authorization: `token ${githubAccessToken}`,
            "User-Agent": "GithubCopilot/1.0",
            "Editor-Version": "vscode/1.100.0",
            "Editor-Plugin-Version": "copilot/1.300.0",
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) return null;
      const data = await response.json();
      log?.info?.("TOKEN", "Copilot token refreshed");
      return { token: data.token, expiresAt: data.expires_at };
    } catch (error) {
      log?.error?.("TOKEN", `Copilot refresh error: ${error.message}`);
      return null;
    }
  }

  async refreshGitHubToken(refreshToken, log) {
    try {
      const response = await fetch(OAUTH_ENDPOINTS.github.token, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      });
      if (!response.ok) return null;
      const tokens = await response.json();
      log?.info?.("TOKEN", "GitHub token refreshed");
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || refreshToken,
        expiresIn: tokens.expires_in,
      };
    } catch (error) {
      log?.error?.("TOKEN", `GitHub refresh error: ${error.message}`);
      return null;
    }
  }

  async refreshCredentials(credentials, log) {
    let copilotResult = await this.refreshCopilotToken(
      credentials.accessToken,
      log,
    );

    if (!copilotResult && credentials.refreshToken) {
      const githubTokens = await this.refreshGitHubToken(
        credentials.refreshToken,
        log,
      );
      if (githubTokens?.accessToken) {
        copilotResult = await this.refreshCopilotToken(
          githubTokens.accessToken,
          log,
        );
        if (copilotResult) {
          return {
            ...githubTokens,
            copilotToken: copilotResult.token,
            copilotTokenExpiresAt: copilotResult.expiresAt,
          };
        }
        return githubTokens;
      }
    }

    if (copilotResult) {
      return {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        copilotToken: copilotResult.token,
        copilotTokenExpiresAt: copilotResult.expiresAt,
      };
    }

    return null;
  }

  needsRefresh(credentials) {
    // Always refresh if no copilotToken
    if (!credentials.copilotToken) return true;

    if (credentials.copilotTokenExpiresAt) {
      // Handle both Unix timestamp (seconds) and ISO string
      let expiresAtMs = credentials.copilotTokenExpiresAt;
      if (typeof expiresAtMs === "number" && expiresAtMs < 1e12) {
        expiresAtMs = expiresAtMs * 1000; // Convert seconds to ms
      } else if (typeof expiresAtMs === "string") {
        expiresAtMs = new Date(expiresAtMs).getTime();
      }
      if (expiresAtMs - Date.now() < 5 * 60 * 1000) return true;
    }
    return super.needsRefresh(credentials);
  }
}

export default GithubExecutor;
