import process from 'node:process';
import console from 'node:console';
import { parseArgs } from 'util';

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
  `);
      return;
    }

    if (values.version) {
      console.log('v0.0.1');
      return;
    }

    const command = positionals[0];

    switch (command) {
      case 'greet':
        // delegate to greet handler
        await (await import('./commands/greet.js')).greet(positionals.slice(1));
        break;
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Run with --help for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}
