import { NextResponse } from "next/server";

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cacheTime < CACHE_TTL) {
      return NextResponse.json(cache);
    }

    const res = await fetch("https://models.dev/api.json");
    if (!res.ok) throw new Error(`models.dev returned ${res.status}`);
    const raw = await res.json();

    const providers = [];
    const models = [];

    for (const [providerKey, providerData] of Object.entries(raw)) {
      if (!providerData || typeof providerData !== "object") continue;

      const providerName =
        providerData.name ||
        providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
      providers.push({ id: providerKey, name: providerName });

      // models.dev returns models as an object keyed by model ID
      let providerModels = [];
      if (providerData.models && typeof providerData.models === "object") {
        if (Array.isArray(providerData.models)) {
          providerModels = providerData.models;
        } else {
          providerModels = Object.entries(providerData.models).map(
            ([id, data]) => ({ id, ...(typeof data === "object" ? data : {}) }),
          );
        }
      } else if (Array.isArray(providerData)) {
        providerModels = providerData;
      }

      for (const model of providerModels) {
        if (!model || !model.id) continue;

        const inputCost = model.cost?.input ?? model.pricing?.prompt ?? null;
        const outputCost =
          model.cost?.output ?? model.pricing?.completion ?? null;
        const isFree =
          inputCost !== null && outputCost !== null
            ? Number(inputCost) === 0 && Number(outputCost) === 0
            : false;

        models.push({
          id: model.id,
          name: model.name || model.id,
          provider: providerKey,
          providerName,
          inputCost: inputCost !== null ? Number(inputCost) : null,
          outputCost: outputCost !== null ? Number(outputCost) : null,
          context:
            model.limit?.context ||
            model.context ||
            model.contextLength ||
            null,
          capabilities: model.capabilities || [],
          tags: model.tags || [],
          free: isFree,
          description: model.description || null,
        });
      }
    }

    providers.sort((a, b) => a.name.localeCompare(b.name));

    const data = { providers, models };
    cache = data;
    cacheTime = now;

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
