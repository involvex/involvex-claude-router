"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

// Get claude settings path based on OS
const getClaudeSettingsPath = () => {
  const homeDir = os.homedir();
  return path.join(homeDir, ".claude", "settings.json");
};

// Check if claude CLI is installed
const checkClaudeInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where claude" : "command -v claude";
    await execAsync(command);
    return true;
  } catch {
    return false;
  }
};

// Lenient JSON parser: handles JSONC comments, trailing commas, and missing commas.
// Uses a character-level pass to strip comments without touching string values,
// so URLs like "http://..." are never mangled.
const stripJsoncComments = text => {
  let out = "";
  let i = 0;
  while (i < text.length) {
    // Quoted string — copy verbatim, respecting escape sequences
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
      // Block comment /* … */
    } else if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      // Line comment // …
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
      .replace(/,(\s*[}\]])/g, "$1") // remove trailing commas
      .replace(/(["}\]])[ \t]*\r?\n([ \t]*["{\[])/g, "$1,\n$2"), // add missing commas
  );

// Read current settings
const readSettings = async () => {
  try {
    const settingsPath = getClaudeSettingsPath();
    const content = await fs.readFile(settingsPath, "utf-8");
    return parseJsonLenient(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

// GET - Check claude CLI and read current settings
export async function GET() {
  try {
    const isInstalled = await checkClaudeInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        settings: null,
        message: "Claude CLI is not installed",
      });
    }

    const settings = await readSettings();
    const has9Router = !!settings?.env?.ANTHROPIC_BASE_URL;

    return NextResponse.json({
      installed: true,
      settings: settings,
      has9Router: has9Router,
      settingsPath: getClaudeSettingsPath(),
    });
  } catch (error) {
    console.log("Error checking claude settings:", error);
    return NextResponse.json(
      { error: "Failed to check claude settings" },
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

    const settingsPath = getClaudeSettingsPath();
    const claudeDir = path.dirname(settingsPath);

    // Ensure .claude directory exists
    await fs.mkdir(claudeDir, { recursive: true });

    // Read current settings
    let currentSettings = {};
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      currentSettings = parseJsonLenient(content);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    // Normalize ANTHROPIC_BASE_URL to ensure /v1 suffix
    if (env.ANTHROPIC_BASE_URL) {
      env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL.endsWith("/v1")
        ? env.ANTHROPIC_BASE_URL
        : `${env.ANTHROPIC_BASE_URL}/v1`;
    }

    // Merge new env with existing settings
    const newSettings = {
      ...currentSettings,
      env: {
        ...currentSettings.env,
        ...env,
      },
    };

    // Write new settings
    await fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2));

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
    });
  } catch (error) {
    console.log("Error updating claude settings:", error);
    return NextResponse.json(
      { error: "Failed to update claude settings" },
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
  "API_TIMEOUT_MS",
];

// DELETE - Reset settings (remove env fields)
export async function DELETE() {
  try {
    const settingsPath = getClaudeSettingsPath();

    // Read current settings
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

    // Remove specified env fields
    if (currentSettings.env) {
      RESET_ENV_KEYS.forEach(key => {
        delete currentSettings.env[key];
      });

      // Clean up empty env object
      if (Object.keys(currentSettings.env).length === 0) {
        delete currentSettings.env;
      }
    }

    // Write updated settings
    await fs.writeFile(settingsPath, JSON.stringify(currentSettings, null, 2));

    return NextResponse.json({
      success: true,
      message: "Settings reset successfully",
    });
  } catch (error) {
    console.log("Error resetting claude settings:", error);
    return NextResponse.json(
      { error: "Failed to reset claude settings" },
      { status: 500 },
    );
  }
}
