#!/usr/bin/env node
// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// src/cli/commands/greet.ts
var exports_greet = {};
__export(exports_greet, {
  greet: () => greet
});
import console2 from "console";
function greet(args = []) {
  const name = args[0] ?? "World";
  const upperCase = args.includes("--upper");
  let message = `Hello, ${name}!`;
  if (upperCase)
    message = message.toUpperCase();
  console2.log(message);
  return message;
}
var init_greet = () => {};

// src/cli/index.ts
import process2 from "process";
import console3 from "console";
import { parseArgs } from "util";
async function runCli(args) {
  const argv = args ?? process2.argv.slice(2);
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        help: {
          type: "boolean",
          short: "h"
        },
        version: {
          type: "boolean",
          short: "v"
        }
      },
      strict: false
    });
    if (values.help) {
      console3.log(`
Usage: involvexclaude-router-cli [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version

Commands:
  greet          Greet someone
  `);
      return;
    }
    if (values.version) {
      console3.log("v0.0.1");
      return;
    }
    const command = positionals[0];
    switch (command) {
      case "greet":
        await (await Promise.resolve().then(() => (init_greet(), exports_greet))).greet(positionals.slice(1));
        break;
      default:
        console3.log(`Unknown command: ${command}`);
        console3.log("Run with --help for usage information");
        process2.exit(1);
    }
  } catch (error) {
    console3.error("Error:", error);
    process2.exit(1);
  }
}

// src/index.ts
var args = process.argv.slice(2);
runCli(args).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
