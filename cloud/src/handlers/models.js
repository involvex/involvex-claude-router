import { getMachineData, saveMachineData } from "../services/storage.js";
import { ollamaModels } from "open-sse/config/ollamaModels.js";
import * as log from "../utils/logger.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

// We'll return a minimal list or what's in ollamaModels for now
// In a full implementation, this should match open-sse/config/providerModels.js
const DEFAULT_MODELS = ollamaModels.models.map(m => ({
  provider: m.name.split("/")[0] || "openai",
  model: m.name.split("/")[1] || m.name,
  fullModel: m.name,
}));

export async function handleModels(request, env, ctx) {
  const machineId = "default";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    switch (request.method) {
      case "GET":
        return await listModels(machineId, env);
      case "PUT":
        return await updateAlias(request, machineId, env);
      default:
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: CORS_HEADERS,
        });
    }
  } catch (error) {
    log.error("MODELS", error.message, { stack: error.stack });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

async function listModels(machineId, env) {
  const data = await getMachineData(machineId, env);
  const modelAliases = data?.modelAliases || {};

  // Use models from open-sse config if possible
  // For now, return a basic list merged with aliases
  const models = DEFAULT_MODELS.map(m => ({
    ...m,
    alias: modelAliases[m.fullModel] || m.model,
  }));

  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: CORS_HEADERS,
  });
}

async function updateAlias(request, machineId, env) {
  const body = await request.json();
  const { model, alias } = body;

  if (!model || !alias) {
    return new Response(JSON.stringify({ error: "Model and alias required" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const data = (await getMachineData(machineId, env)) || {};
  const modelAliases = data.modelAliases || {};

  // Update alias
  modelAliases[model] = alias;
  data.modelAliases = modelAliases;

  await saveMachineData(machineId, data, env);

  return new Response(JSON.stringify({ success: true, model, alias }), {
    status: 200,
    headers: CORS_HEADERS,
  });
}
