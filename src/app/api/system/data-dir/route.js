"use server";

import { NextResponse } from "next/server";
import os from "os";

function getAppName() {
  return process.env.APP_NAME || "involvex-claude-router";
}

function expandTilde(dir) {
  if (!dir) return dir;
  if (dir.startsWith("~/") || dir === "~") {
    return dir.replace(/^~/, os.homedir());
  }
  return dir;
}

function getDataDir() {
  if (process.env.DATA_DIR) return expandTilde(process.env.DATA_DIR);

  const platform = process.platform;
  const homeDir = os.homedir();
  const appName = getAppName();

  if (platform === "win32") {
    const appData = process.env.APPDATA || `${homeDir}\\AppData\\Roaming`;
    return `${appData}\\${appName}`;
  }
  return `${homeDir}/.${appName}`;
}

export async function GET() {
  const dataDir = getDataDir();
  const sep = process.platform === "win32" ? "\\" : "/";
  const dbFile = `${dataDir}${dataDir.endsWith(sep) ? "" : sep}db.json`;
  return NextResponse.json({ dataDir, dbFile });
}
