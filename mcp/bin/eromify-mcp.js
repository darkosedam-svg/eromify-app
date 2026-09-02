#!/usr/bin/env node
import process from 'node:process';
import readline from 'node:readline/promises';

import { EromifyClient } from '../src/client.js';
import { CONFIG_FILE, resolveConfig, writeStoredConfig } from '../src/config.js';
import { CLIENTS, install, normalizeClient, status, uninstall } from '../src/install.js';
import { serve } from '../src/server.js';
import { TOOLS } from '../src/tools.js';

const USAGE = `eromify-mcp — Model Context Protocol server for Eromify

Usage:
  eromify-mcp serve                          Run the MCP server on stdio (default)
  eromify-mcp install --client <name>        Register the server with an MCP client
  eromify-mcp uninstall --client <name>      Remove the server from an MCP client
  eromify-mcp login [--email <e>]            Store an API token in ${CONFIG_FILE}
  eromify-mcp logout                         Forget the stored API token
  eromify-mcp status                         Show where the server is installed
  eromify-mcp doctor                         Check the API URL, token and tools
  eromify-mcp tools                          List the tools this server exposes

Clients:
  ${Object.entries(CLIENTS).map(([n, c]) => `${n.padEnd(15)} ${c.label}`).join('\n  ')}

Options:
  --client <name>     Target MCP client (required by install/uninstall)
  --scope <s>         user (default) or project
  --name <n>          Server name written to the config (default: eromify)
  --api-url <url>     Eromify API base URL
  --token <token>     API token to use, and to embed in the client config
  --embed-token       Embed the stored/env token in the client config
  --npx               Point the config at "npx -y eromify-mcp" instead of this checkout
  --force             Overwrite an existing entry with the same name
  --dry-run           Print what would be written, change nothing
  -h, --help          Show this help

Environment:
  EROMIFY_API_URL     API base URL (default https://eromify-backend.onrender.com/api)
  EROMIFY_API_TOKEN   Bearer token for the API
  EROMIFY_TIMEOUT_MS  Request timeout in ms (default 120000)
`;

const BOOLEAN_FLAGS = new Set(['embed-token', 'npx', 'force', 'dry-run', 'help', 'h']);

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.replace(/^--?/, '').split('=');
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = inline === undefined ? true : inline !== 'false';
    } else if (inline !== undefined) {
      flags[name] = inline;
    } else {
      flags[name] = argv[++i];
    }
  }
  return { command: positional[0], flags };
}

function requireClient(flags) {
  const name = normalizeClient(flags.client);
  if (!name) {
    fail(`--client is required. Supported: ${Object.keys(CLIENTS).join(', ')}.`);
  }
  if (!CLIENTS[name]) {
    fail(`Unknown client "${flags.client}". Supported: ${Object.keys(CLIENTS).join(', ')}.`);
  }
  return name;
}

function fail(message) {
  console.error(`eromify-mcp: ${message}`);
  process.exit(1);
}

async function cmdInstall(flags) {
  const client = requireClient(flags);
  const scope = flags.scope || 'user';
  const { apiUrl, token } = resolveConfig({ apiUrl: flags['api-url'], token: flags.token });
  const embed = Boolean(flags.token) || Boolean(flags['embed-token']);

  const result = install({
    client,
    scope,
    serverName: flags.name || 'eromify',
    apiUrl,
    token: embed ? token : null,
    useNpx: flags.npx ? true : undefined,
    force: Boolean(flags.force),
    dryRun: Boolean(flags['dry-run']),
  });

  if (result.status === 'exists') {
    console.error(
      `"${result.serverName}" is already configured in ${result.configPath}.\n` +
        'Re-run with --force to overwrite it.'
    );
    process.exit(1);
  }

  if (result.status === 'dry-run') {
    console.log(`Would write to ${result.configPath}:`);
    console.log(JSON.stringify({ [result.key]: { [result.serverName]: result.entry } }, null, 2));
    return;
  }

  console.log(`${result.status === 'replaced' ? 'Updated' : 'Installed'} "${result.serverName}" for ${result.label}.`);
  console.log(`  config:  ${result.configPath}`);
  if (result.backupPath) console.log(`  backup:  ${result.backupPath}`);
  console.log(`  command: ${result.entry.command} ${result.entry.args.join(' ')}`);
  console.log(`  api:     ${result.entry.env.EROMIFY_API_URL}`);

  if (!token) {
    console.log('\nNo API token found. Run `eromify-mcp login` so the server can reach your account.');
  } else if (!embed) {
    console.log(`\nUsing the token stored in ${CONFIG_FILE}. Pass --embed-token to write it into the client config instead.`);
  }
  console.log(`\nRestart ${result.label} to pick up the new server.`);
}

function cmdUninstall(flags) {
  const client = requireClient(flags);
  const result = uninstall({
    client,
    scope: flags.scope || 'user',
    serverName: flags.name || 'eromify',
  });
  console.log(
    result.status === 'removed'
      ? `Removed "${result.serverName}" from ${result.label} (${result.configPath}).`
      : `"${result.serverName}" was not configured in ${result.configPath}.`
  );
}

async function cmdLogin(flags) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const email = flags.email || (await rl.question('Eromify email: '));
    const password = flags.password || (await rl.question('Password: '));
    const apiUrl = flags['api-url'] || resolveConfig().apiUrl;
    const client = new EromifyClient({ apiUrl, token: 'unused' });
    const { token, user } = await client.login(email.trim(), password);
    writeStoredConfig({ apiUrl, token });
    console.log(`Logged in as ${user?.email || email.trim()}. Token saved to ${CONFIG_FILE}.`);
  } catch (error) {
    fail(error.message);
  } finally {
    rl.close();
  }
}

function cmdLogout() {
  writeStoredConfig({ token: null });
  console.log(`Cleared the stored token in ${CONFIG_FILE}.`);
}

function cmdStatus(flags) {
  const rows = status({ serverName: flags.name || 'eromify' });
  for (const row of rows) {
    const mark = row.installed ? 'installed' : row.exists ? 'not installed' : 'no config file';
    console.log(`${row.label} (${row.scope})`.padEnd(28) + mark.padEnd(16) + row.configPath);
  }
}

async function cmdDoctor(flags) {
  const { apiUrl, token } = resolveConfig({ apiUrl: flags['api-url'], token: flags.token });
  console.log(`api url:  ${apiUrl}`);
  console.log(`token:    ${token ? `present (${token.slice(0, 8)}…)` : 'missing — run `eromify-mcp login`'}`);
  console.log(`tools:    ${TOOLS.length}`);

  const client = new EromifyClient({ apiUrl, token });
  try {
    await client.get('/payments/pricing-plans', { auth: false });
    console.log('reachable: yes');
  } catch (error) {
    console.log(`reachable: no — ${error.message}`);
    process.exitCode = 1;
  }

  if (!token) return;
  try {
    const profile = await client.get('/users/profile');
    const user = profile?.user || profile?.profile || {};
    console.log(`account:   ${user.email || 'authenticated'}${user.credits !== undefined ? ` (${user.credits} credits)` : ''}`);
  } catch (error) {
    console.log(`account:   ${error.message}`);
    process.exitCode = 1;
  }
}

function cmdTools() {
  for (const tool of TOOLS) {
    console.log(`${tool.name}${tool.readOnly ? '' : tool.destructive ? '  [destructive]' : '  [writes]'}`);
    console.log(`  ${tool.description}`);
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    console.log(USAGE);
    return;
  }

  switch (command || 'serve') {
    case 'serve':
      await serve({ apiUrl: flags['api-url'], token: flags.token });
      return;
    case 'install':
      return cmdInstall(flags);
    case 'uninstall':
      return cmdUninstall(flags);
    case 'login':
      return cmdLogin(flags);
    case 'logout':
      return cmdLogout();
    case 'status':
      return cmdStatus(flags);
    case 'doctor':
      return cmdDoctor(flags);
    case 'tools':
      return cmdTools();
    case 'help':
      console.log(USAGE);
      return;
    default:
      fail(`Unknown command "${command}". Run \`eromify-mcp --help\`.`);
  }
}

main().catch((error) => fail(error.message));
