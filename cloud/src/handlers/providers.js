import { getMachineData, saveMachineData } from "../services/storage.js";
import * as log from "../utils/logger.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function handleProviders(request, env, ctx) {
  const machineId = "default";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    switch (request.method) {
      case "GET":
        return await listProviders(machineId, env);
      case "POST":
        return await createProvider(request, machineId, env);
      default:
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: CORS_HEADERS,
        });
    }
  } catch (error) {
    log.error("PROVIDERS", error.message, { stack: error.stack });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

async function listProviders(machineId, env) {
  const data = await getMachineData(machineId, env);
  const providers = data?.providers || {};

  // Format as array for dashboard (Next.js expects { connections: [...] })
  const connections = Object.values(providers).map(c => ({
    ...c,
    apiKey: undefined,
    accessToken: undefined,
    refreshToken: undefined,
    idToken: undefined,
  }));

  return new Response(JSON.stringify({ connections }), {
    status: 200,
    headers: CORS_HEADERS,
  });
}

async function createProvider(request, machineId, env) {
  const body = await request.json();
  const {
    provider,
    apiKey,
    name,
    priority,
    globalPriority,
    defaultModel,
    providerSpecificData,
    testStatus,
  } = body;

  if (!provider || !name) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const data = (await getMachineData(machineId, env)) || { providers: {} };
  const providers = data.providers || {};

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const newConnection = {
    id,
    provider,
    authType: "apikey",
    name,
    apiKey,
    priority: priority || 1,
    globalPriority: globalPriority || null,
    defaultModel: defaultModel || null,
    providerSpecificData: providerSpecificData || {},
    isActive: true,
    testStatus: testStatus || "unknown",
    createdAt: now,
    updatedAt: now,
  };

  providers[id] = newConnection;
  data.providers = providers;

  await saveMachineData(machineId, data, env);

  // Return safe connection
  const safeConnection = { ...newConnection, apiKey: undefined };

  return new Response(JSON.stringify({ connection: safeConnection }), {
    status: 201,
    headers: CORS_HEADERS,
  });
}
