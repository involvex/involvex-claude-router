import { getMachineData, saveMachineData } from "../services/storage.js";
import { getDefaultPricing } from "../config/pricing.js";
import * as log from "../utils/logger.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function handlePricing(request, env, ctx) {
  // Extract machineId from URL or assume single-tenant if no machineId in path
  // Since dashboard calls /api/pricing directly (no machineId in path),
  // we might need to rely on cookie or assume "default" machineId for single-tenant worker?
  // OR we can parse it from Authorization header if the dashboard sends one?
  // But the dashboard is static assets served from THIS worker.
  // It doesn't know its machineId yet unless we bake it in or use a default.

  // For "self-hosted" mode (single user), we can use a fixed ID like "default" or "self-hosted".
  const machineId = "default";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    switch (request.method) {
      case "GET":
        return await getPricing(machineId, env);
      case "POST": // Or PATCH
      case "PATCH":
        return await updatePricing(request, machineId, env);
      case "DELETE":
        return await resetPricing(request, machineId, env);
      default:
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: CORS_HEADERS,
        });
    }
  } catch (error) {
    log.error("PRICING", error.message, { stack: error.stack });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

async function getPricing(machineId, env) {
  const data = await getMachineData(machineId, env);

  // Merge defaults with user overrides
  const pricing = {
    ...getDefaultPricing(),
    ...(data?.pricing || {}),
  };

  return new Response(JSON.stringify(pricing), {
    status: 200,
    headers: CORS_HEADERS,
  });
}

async function updatePricing(request, machineId, env) {
  const body = await request.json();

  // Validation (simplified)
  if (!body || typeof body !== "object") {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const data = (await getMachineData(machineId, env)) || {};

  // Merge or replace pricing? The dashboard sends full structure usually for specific provider/model updates
  // But the route.js implementation merges.
  // We'll simplistic merge at top level: data.pricing = { ...data.pricing, ...body }

  // Actually, the dashboard sends structured updates.
  // Let's just store whatever it sends in `pricing` field.
  // If dashboard PATCHes partial updates, we need to merge deep.
  // But for now, let's assume it sends comprehensive updates or top-level keys.

  const currentPricing = data.pricing || {};
  // Deep merge logic might be needed if body is partial.
  // For simplicity, let's do shallow merge of providers.

  const newPricing = { ...currentPricing };

  for (const [provider, models] of Object.entries(body)) {
    newPricing[provider] = {
      ...(newPricing[provider] || {}),
      ...models,
    };
  }

  data.pricing = newPricing;

  await saveMachineData(machineId, data, env);

  return new Response(JSON.stringify(newPricing), {
    status: 200,
    headers: CORS_HEADERS,
  });
}

async function resetPricing(request, machineId, env) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const model = url.searchParams.get("model");

  const data = await getMachineData(machineId, env);
  if (!data || !data.pricing) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: CORS_HEADERS,
    });
  }

  if (provider && model) {
    if (data.pricing[provider]) {
      delete data.pricing[provider][model];
      if (Object.keys(data.pricing[provider]).length === 0) {
        delete data.pricing[provider];
      }
    }
  } else if (provider) {
    delete data.pricing[provider];
  } else {
    data.pricing = {};
  }

  await saveMachineData(machineId, data, env);

  return new Response(JSON.stringify(data.pricing), {
    status: 200,
    headers: CORS_HEADERS,
  });
}
