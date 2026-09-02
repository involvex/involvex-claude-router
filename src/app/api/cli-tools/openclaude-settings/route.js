"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

// Get openclaude settings path — same as Claude Code (uses ~/.claude/settings.json)
const getOpenClaudeSettingsPath = () =>
  path.join(os.homedir(), ".claude", "settings.json");

// Check if openclaude CLI is installed
const checkOpenClaudeInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where openclaude" : "command -v openclaude";
    await execAsync(command);
    return true;
  } catch {
    return false;
  }
};

// Lenient JSON parser: handles JSONC comments, trailing commas, and missing commas.
const stripJsoncComments = text => {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      out += text.slice(i, j);
      i = j;
    } else if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i++;
    } else {
      out += text[i++];
    }
  }
  return out;
};

const parseJsonLenient = text =>
  JSON.parse(
    stripJsoncComments(text)
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/(["}\]])[ \t]*\r?\n([ \t]*["{\[])/g, "$1,\n$2"),
  );

// Read current settings
const readSettings = async () => {
  try {
    const settingsPath = getOpenClaudeSettingsPath();
    const content = await fs.readFile(settingsPath, "utf-8");
    return parseJsonLenient(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

// GET - Check openclaude CLI and read current settings
export async function GET() {
  try {
    const isInstalled = await checkOpenClaudeInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        settings: null,
        message: "OpenClaude CLI is not installed",
      });
    }

    const settings = await readSettings();
    const has9Router = !!settings?.env?.ANTHROPIC_BASE_URL;

    return NextResponse.json({
      installed: true,
      settings: settings,
      has9Router: has9Router,
      settingsPath: getOpenClaudeSettingsPath(),
    });
  } catch (error) {
    console.log("Error checking openclaude settings:", error);
    return NextResponse.json(
      { error: "Failed to check openclaude settings" },
      { status: 500 },
    );
  }
}

// POST - Backup old fields and write new settings
export async function POST(request) {
  try {
    const { env } = await request.json();

    if (!env || typeof env !== "object") {
      return NextResponse.json(
        { error: "Invalid env object" },
        { status: 400 },
      );
    }

    const settingsPath = getOpenClaudeSettingsPath();
    const claudeDir = path.dirname(settingsPath);

    await fs.mkdir(claudeDir, { recursive: true });

    let currentSettings = {};
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      currentSettings = parseJsonLenient(content);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (env.ANTHROPIC_BASE_URL) {
      env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL.endsWith("/v1")
        ? env.ANTHROPIC_BASE_URL
        : `${env.ANTHROPIC_BASE_URL}/v1`;
    }

    const newSettings = {
      ...currentSettings,
      env: {
        ...currentSettings.env,
        ...env,
      },
    };

    await fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2));

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
    });
  } catch (error) {
    console.log("Error updating openclaude settings:", error);
    return NextResponse.json(
      { error: "Failed to update openclaude settings" },
      { status: 500 },
    );
  }
}

// Fields to remove when resetting
const RESET_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_MODEL",
  "API_TIMEOUT_MS",
];

// DELETE - Reset settings (remove env fields)
export async function DELETE() {
  try {
    const settingsPath = getOpenClaudeSettingsPath();

    let currentSettings = {};
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      currentSettings = parseJsonLenient(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No settings file to reset",
        });
      }
      throw error;
    }

    if (currentSettings.env) {
      RESET_ENV_KEYS.forEach(key => {
        delete currentSettings.env[key];
      });

      if (Object.keys(currentSettings.env).length === 0) {
        delete currentSettings.env;
      }
    }

    await fs.writeFile(settingsPath, JSON.stringify(currentSettings, null, 2));

    return NextResponse.json({
      success: true,
      message: "Settings reset successfully",
    });
  } catch (error) {
    console.log("Error resetting openclaude settings:", error);
    return NextResponse.json(
      { error: "Failed to reset openclaude settings" },
      { status: 500 },
    );
  }
}
