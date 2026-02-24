import { execSync } from 'node:child_process';
// import { require } from 'module';
// import { createRequire } from 'node:module';
import { status } from './commands/status';
import { models } from './commands/models';
import { start } from './commands/start';
import { greet } from './commands/greet';
import pkg from '../../../package.json';
import { stop } from './commands/stop';
import process from 'node:process';
import console from 'node:console';
import { parseArgs } from 'util';
import path from 'node:path';

// const _require = createRequire(import.meta.url);

export async function runCli(args?: string[]) {
  const argv = args ?? process.argv.slice(2);

  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        help: {
          type: 'boolean',
          short: 'h'
        },
        version: {
          type: 'boolean',
          short: 'v'
        }
      },
      strict: false
    });

    if (values.help) {
      console.log(`
Usage: involvexclaude-router-cli [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version

Commands:
  greet          Greet someone
  start          Start the router dev server
  stop           Stop the router dev server
  status         Show router status
  models         Manage models (list|add|remove)
  `);
      return;
    }

    if (values.version) {
      console.log(`v${pkg.version}`);
      return;
    }

    const command = positionals[0];

    switch (command) {
      case 'greet':
        await greet(positionals.slice(1));
        break;
      case 'start':
        await start(positionals.slice(1));
        break;
      case 'stop':
        stop();
        break;
      case 'status':
        await status(positionals.slice(1));
        break;
      case 'models':
        await models(positionals.slice(1));
        break;
      default:
        console.log('Starting router dev server by default');
        execSync(
          `powershell -F "${path.resolve(__dirname, '../../../scripts/start-router.ps1')}"`,
          { stdio: 'inherit' }
        );
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}
