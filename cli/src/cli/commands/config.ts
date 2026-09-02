import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/** Patterns matching sensitive field names that should be redacted in output */
const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
];

/** Recursively redact sensitive fields from an object before display */
function redactSensitive(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitive(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function getDataDir(): string | null {
  const appName = "involvex-claude-router";
  const homeDir = os.homedir();

  if (process.platform === "win32") {
    const appDataRoot =
      process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return path.join(appDataRoot, appName);
  }
  return path.join(homeDir, `.${appName}`);
}

function getDbPath(): string {
  const dataDir = getDataDir();
  if (!dataDir) {
    throw new Error("Could not determine data directory");
  }
  return path.join(dataDir, "db.json");
}

function getLogPath(): string {
  const dataDir = getDataDir();
  if (!dataDir) {
    throw new Error("Could not determine data directory");
  }
  return path.join(dataDir, "log.txt");
}

function readDb(): Record<string, unknown> {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Config file not found: ${dbPath}`);
  }
  const raw = fs.readFileSync(dbPath, "utf-8");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to parse config: ${dbPath}`);
  }
}

function writeDb(data: Record<string, unknown>): void {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Get a nested value from an object using dot notation (e.g., "settings.cloudEnabled")
 */
function getNested(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Set a nested value on an object using dot notation
 */
function setNested(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): void {
  const keys = keyPath.split(".");
  const lastKey = keys.pop()!;
  let current = obj;
  for (const key of keys) {
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[lastKey] = value;
}

function parseValue(val: string): unknown {
  if (val.toLowerCase() === "true") return true;
  if (val.toLowerCase() === "false") return false;
  if (val.toLowerCase() === "null") return null;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}

export async function config(argv: string[] = []): Promise<void> {
  const [sub, ...rest] = argv;

  switch (sub) {
    case "list": {
      try {
        const db = readDb();
        const safe = redactSensitive(db);
        console.log(JSON.stringify(safe, null, 2));
      } catch (err: unknown) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
      break;
    }

    case "get": {
      if (!rest[0]) {
        console.error("Usage: ccr config get <key>");
        console.error("  Examples:");
        console.error("    ccr config get settings");
        console.error("    ccr config get settings.cloudEnabled");
        process.exit(1);
      }
      try {
        const db = readDb();
        const value = getNested(db, rest[0]);
        if (value === undefined) {
          console.log("undefined");
        } else {
          const safe =
            typeof value === "object" ? redactSensitive(value) : value;
          console.log(JSON.stringify(safe, null, 2));
        }
      } catch (err: unknown) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
      break;
    }

    case "set": {
      if (rest.length < 2) {
        console.error("Usage: ccr config set <key> <value>");
        console.error("  Examples:");
        console.error("    ccr config set settings.cloudEnabled true");
        console.error("    ccr config set settings.tunnelEnabled false");
        console.error("    ccr config set settings.logLevel debug");
        process.exit(1);
      }
      try {
        const db = readDb();
        const keyPath = rest[0];
        const value = parseValue(rest.slice(1).join(" "));
        setNested(db, keyPath, value);
        writeDb(db);
        console.log(`Set ${keyPath} = ${JSON.stringify(value)}`);
        console.log(`Config file: ${getDbPath()}`);
      } catch (err: unknown) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
      break;
    }

    case "delete": {
      if (!rest[0]) {
        console.error("Usage: ccr config delete <key>");
        process.exit(1);
      }
      try {
        const db = readDb();
        const keys = rest[0].split(".");
        const lastKey = keys.pop()!;
        let current = db;
        for (const key of keys) {
          if (!(key in current) || typeof current[key] !== "object") {
            console.error(`Key not found: ${rest[0]}`);
            process.exit(1);
          }
          current = (current as Record<string, unknown>)[key] as Record<
            string,
            unknown
          >;
        }
        delete (current as Record<string, unknown>)[lastKey];
        writeDb(db);
        console.log(`Deleted ${rest[0]}`);
      } catch (err: unknown) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
      break;
    }

    default: {
      console.log("Usage: ccr config <list|get|set|delete> [key] [value]");
      console.log("");
      console.log("Commands:");
      console.log("  list              Show entire config as JSON");
      console.log("  get <key>         Get value for a key (dot notation)");
      console.log("  set <key> <value> Set value for a key (dot notation)");
      console.log("  delete <key>      Delete a key (dot notation)");
      console.log("");
      console.log("Examples:");
      console.log("  ccr config list");
      console.log("  ccr config get settings.cloudEnabled");
      console.log("  ccr config set settings.logLevel debug");
      console.log("  ccr config delete settings.tunnelUrl");
      console.log("");
      console.log(`Config file: ${getDbPath()}`);
    }
  }
}

// Export for testing
export { getDataDir, getDbPath, getLogPath, getNested, setNested, parseValue };
