"use server";

import { NextResponse } from "next/server";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";
import fs from "fs";

function getAppName() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const rootPkgPath = path.resolve(__dirname, "../../../../../package.json");
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
    return pkg.config?.appName || "involvex-claude-router";
  } catch {
    return "involvex-claude-router";
  }
}

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;

  const platform = process.platform;
  const homeDir = os.homedir();
  const appName = getAppName();

  if (platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
      appName,
    );
  }
  return path.join(homeDir, `.${appName}`);
}

export async function GET() {
  const dataDir = getDataDir();
  const dbFile = path.join(dataDir, "db.json");
  return NextResponse.json({ dataDir, dbFile });
}
