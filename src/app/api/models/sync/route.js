import { getSyncedModels, setAllSyncedModels } from "@/lib/localDb";
import { writeFile } from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const models = await getSyncedModels();
    return Response.json({ models });
  } catch (err) {
    console.error("[models/sync] GET error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// Map models.dev provider IDs → app provider IDs
const PROVIDER_MAPPING = {
  openai: "openai",
  anthropic: "anthropic",
  google: "gemini",
  groq: "groq",
  mistral: "mistral",
  cohere: "cohere",
  deepseek: "deepseek",
  together: "together",
  fireworks: "fireworks",
  perplexity: "perplexity",
  openrouter: "openrouter",
  minimax: "minimax",
  cerebras: "cerebras",
  nvidia: "nvidia",
  nebius: "nebius",
  siliconflow: "siliconflow",
  hyperbolic: "hyperbolic",
  xai: "xai",
};

function isTextOutputModel(model) {
  const out = model?.modalities?.output;
  if (!Array.isArray(out)) return true;
  return out.includes("text");
}

function isEmbeddingModel(model) {
  const id = (model.id || "").toLowerCase();
  const name = (model.name || "").toLowerCase();
  return (
    id.includes("embed") ||
    name.includes("embed") ||
    id.includes("embedding") ||
    name.includes("embedding")
  );
}

function getDisplayName(modelId, modelData) {
  return modelData.name || modelId;
}

export async function POST(request) {
  try {
    const res = await fetch("https://models.dev/api.json");
    if (!res.ok) {
      return Response.json(
        { error: `models.dev returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const apiData = await res.json();
    const synced = {};
    let totalModels = 0;
    const updatedProviders = [];

    for (const [devProviderId, providerData] of Object.entries(apiData)) {
      const appProviderId = PROVIDER_MAPPING[devProviderId];
      if (!appProviderId) continue;

      const rawModels = providerData.models;
      if (!rawModels || typeof rawModels !== "object") continue;

      const models = Object.entries(rawModels)
        .map(([modelId, modelData]) => ({
          id: modelId,
          name: getDisplayName(modelId, modelData),
          ...(modelData.cost?.input === 0 && modelData.cost?.output === 0
            ? { free: true }
            : {}),
        }))
        .filter(
          m => isTextOutputModel(rawModels[m.id]) && !isEmbeddingModel(m),
        );

      if (models.length === 0) continue;

      synced[appProviderId] = models;
      totalModels += models.length;
      updatedProviders.push(appProviderId);
    }

    // Persist to DB
    await setAllSyncedModels(synced);

    // Also write the generated JSON file so providerModels.js picks it up after restart
    const generatedPath = path.join(
      process.cwd(),
      "open-sse",
      "config",
      "providerModels.generated.json",
    );
    await writeFile(
      generatedPath,
      JSON.stringify(
        { syncedAt: new Date().toISOString(), providers: synced },
        null,
        2,
      ),
      "utf-8",
    );

    return Response.json({
      success: true,
      updated: updatedProviders.length,
      total: totalModels,
      providers: updatedProviders,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[models/sync] Error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
