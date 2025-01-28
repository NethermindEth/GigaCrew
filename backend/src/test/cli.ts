import { program } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import * as readline from 'readline';

const API_URL = 'http://localhost:3001/api';

// Helper to print responses nicely
const printResponse = (data: any) => {
  console.log(chalk.cyan('Response:'));
  console.log(JSON.stringify(data, null, 2));
};

// Setup readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.green('api-cli> ')
});

// Setup commands
const setupCommands = () => {
  program.version('1.0.0');

  // Service Commands
  program
    .command('services')
    .description('List all indexed services')
    .option('-p, --page <page>', 'Page number', '1')
    .option('-l, --limit <limit>', 'Results per page', '10');

  program
    .command('service')
    .description('Get service by ID')
    .requiredOption('-s, --service <serviceId>', 'Service ID');

  program
    .command('search-services')
    .description('Search services by title and description')
    .requiredOption('-q, --query <query>', 'Search query')
    .option('-l, --limit <limit>', 'Maximum number of results', '10');
};

// Command handlers
const handlers: { [key: string]: (options: any) => Promise<void> } = {
  async services(options) {
    const response = await axios.get(`${API_URL}/services`, {
      params: {
        page: Number(options.page),
        limit: Number(options.limit)
      }
    });
    return response.data;
  },

  async service(options) {
    const response = await axios.get(`${API_URL}/services/${options.service}`);
    return response.data;
  },

  async 'search-services'(options) {
    const response = await axios.get(`${API_URL}/services/search`, {
      params: {
        query: options.query,
        limit: Number(options.limit)
      }
    });
    return response.data;
  }
};

// Help command
const showHelp = () => {
  console.log(chalk.yellow('\nAvailable Commands:'));
  program.commands.forEach(cmd => {
    console.log(chalk.green(`${cmd.name()}`));
  });
  console.log('\n');
};

// Process command
const processCommand = async (line: string) => {
  try {
    if (!line.trim()) {
      showHelp();
      return;
    }

    // Split command line respecting quotes
    const args = line.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => 
      // Remove surrounding quotes if present and unescape internal quotes
      arg.startsWith('"') && arg.endsWith('"') 
        ? arg.slice(1, -1).replace(/\\"/g, '"') 
        : arg
    ) || [];

    const cmd = program.commands.find(c => c.name() === args[0]);

    if (!cmd) {
      console.log(chalk.red(`Unknown command: ${args[0]}`));
      showHelp();
      return;
    }

    // Show command help if no arguments provided
    if (args.length === 1 && cmd.options.length > 0) {
      console.log(chalk.yellow(`\nCommand: ${cmd.name()}`));
      console.log(chalk.white(cmd.description()));
      console.log(chalk.cyan('Options:'));
      cmd.options.forEach(option => {
        console.log(`  ${chalk.blue(option.flags)}: ${option.description}`);
      });
      console.log('\n');
      return;
    }

    // Execute command
    try {
      const parsed = program.parse(args, { from: 'user' });
      const cmdObj = parsed.commands.find(c => c.name() === args[0]);
      
      if (!cmdObj) {
        throw new Error('Command not found');
      }

      // Extract options from the command
      const options: { [key: string]: string } = {};
      cmdObj.options.forEach(opt => {
        const key = opt.attributeName();
        const longFlag = `--${key}`;
        const shortFlag = opt.short;
        
        // Find the index of either the long or short flag
        let flagIndex = args.findIndex(arg => arg === longFlag || arg === shortFlag);
        
        if (flagIndex !== -1 && flagIndex + 1 < args.length) {
          const value = args[flagIndex + 1];
          // Store the value without quotes if it was a quoted string
          options[key] = value;
        } else if (opt.defaultValue !== undefined) {
          // Set default value for optional parameters
          options[key] = opt.defaultValue;
        } else if (opt.required) {
          throw { code: 'commander.missingMandatoryOptionValue', option: opt };
        }
      });

      const result = await handlers[args[0]](options);
      printResponse(result);
    } catch (error: any) {
      if (error.code === 'commander.missingMandatoryOptionValue') {
        console.log(chalk.red('Error: Missing required options'));
        console.log(chalk.yellow(`\nCommand: ${cmd.name()}`));
        console.log(chalk.cyan('Required Options:'));
        cmd.options.forEach(option => {
          if (option.required) {
            console.log(`  ${chalk.blue(option.flags)}: ${option.description}`);
          }
        });
        console.log('\n');
      } else {
        console.error(chalk.red('Error:'), error.response?.data || error.message);
      }
    }
  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message);
  }
};

// Main
const main = async () => {
  console.log(chalk.green('Interactive API CLI'));
  console.log(chalk.yellow('Type "help" to see available commands'));
  console.log(chalk.yellow('Press Ctrl+C to exit\n'));

  setupCommands();

  rl.prompt();

  rl.on('line', async (line) => {
    if (line.trim() === 'help') {
      showHelp();
    } else {
      await processCommand(line);
    }
    rl.prompt();
  }).on('close', () => {
    console.log(chalk.yellow('\nGoodbye!'));
    process.exit(0);
  });
};

main().catch(console.error); 