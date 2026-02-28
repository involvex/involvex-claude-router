#!/usr/bin/env node
import { runCli } from "./cli/index.js";

const args = process.argv.slice(2);

runCli(args).catch(err => {
  // Simple error handling for CLI

  console.error("Error:", err);
  process.exit(1);
});
