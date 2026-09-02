import { getUsageStats } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

/**
 * Escape a string for use as a Prometheus metric label value.
 * @param {string} str
 * @returns {string}
 */
function escapeLabel(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * GET /api/metrics - Prometheus-format metrics endpoint
 *
 * Exposes counters and gauges for request volume, token usage,
 * cost, and active request counts. Scraped by Prometheus or
 * compatible monitoring systems.
 */
export async function GET(request) {
  try {
    const stats = await getUsageStats();

    const lines = [];

    // === Counters ===
    lines.push(
      "# HELP router_requests_total Total number of requests processed",
    );
    lines.push("# TYPE router_requests_total counter");
    lines.push(`router_requests_total ${stats.totalRequests || 0}`);

    lines.push("# HELP router_tokens_total Total tokens processed");
    lines.push("# TYPE router_tokens_total counter");
    lines.push(
      `router_tokens_total{direction="input"} ${stats.totalPromptTokens || 0}`,
    );
    lines.push(
      `router_tokens_total{direction="output"} ${stats.totalCompletionTokens || 0}`,
    );

    lines.push("# HELP router_cost_usd_total Total cost in USD");
    lines.push("# TYPE router_cost_usd_total counter");
    lines.push(`router_cost_usd_total ${stats.totalCost || 0}`);

    // === Gauges ===
    lines.push(
      "# HELP router_active_requests Number of currently active requests",
    );
    lines.push("# TYPE router_active_requests gauge");

    const activeByAccount = {};
    for (const req of stats.activeRequests || []) {
      const key = req.account || "unknown";
      if (!activeByAccount[key]) activeByAccount[key] = 0;
      activeByAccount[key]++;
    }
    if (Object.keys(activeByAccount).length === 0) {
      lines.push(`router_active_requests{account="none"} 0`);
    } else {
      for (const [account, count] of Object.entries(activeByAccount)) {
        lines.push(
          `router_active_requests{account="${escapeLabel(account)}"} ${count}`,
        );
      }
    }

    // === Per-provider breakdowns ===
    lines.push(
      "# HELP router_provider_requests_total Requests processed per provider",
    );
    lines.push("# TYPE router_provider_requests_total counter");
    for (const [provider, data] of Object.entries(stats.byProvider || {})) {
      lines.push(
        `router_provider_requests_total{provider="${escapeLabel(provider)}"} ${data.requests || 0}`,
      );
    }

    lines.push(
      "# HELP router_provider_tokens_total Tokens processed per provider",
    );
    lines.push("# TYPE router_provider_tokens_total counter");
    for (const [provider, data] of Object.entries(stats.byProvider || {})) {
      lines.push(
        `router_provider_tokens_total{provider="${escapeLabel(provider)}",direction="input"} ${data.promptTokens || 0}`,
      );
      lines.push(
        `router_provider_tokens_total{provider="${escapeLabel(provider)}",direction="output"} ${data.completionTokens || 0}`,
      );
    }

    lines.push(
      "# HELP router_provider_cost_usd_total Cost per provider in USD",
    );
    lines.push("# TYPE router_provider_cost_usd_total counter");
    for (const [provider, data] of Object.entries(stats.byProvider || {})) {
      lines.push(
        `router_provider_cost_usd_total{provider="${escapeLabel(provider)}"} ${data.cost || 0}`,
      );
    }

    // === Error provider gauge ===
    lines.push(
      "# HELP router_error_provider Last provider that returned an error",
    );
    lines.push("# TYPE router_error_provider gauge");
    const errorProvider = stats.errorProvider ? 1 : 0;
    lines.push(
      `router_error_provider{provider="${escapeLabel(stats.errorProvider || "none")}"} ${errorProvider}`,
    );

    return new Response(lines.join("\n") + "\n", {
      headers: {
        "Content-Type": "text/plain; version=0.0.4",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response("# Internal error generating metrics\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  }
}
