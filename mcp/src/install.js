import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_API_URL } from './config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');
const BIN_PATH = path.join(PACKAGE_ROOT, 'bin', 'eromify-mcp.js');

const appData = () => process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

/**
 * Supported MCP clients. `user`/`project` return the config file for that
 * scope, or null when the client has no such scope. `key` is the object in
 * the config file that holds server definitions.
 */
export const CLIENTS = {
  claude: {
    label: 'Claude Code',
    key: 'mcpServers',
    user: () => path.join(os.homedir(), '.claude.json'),
    project: (cwd) => path.join(cwd, '.mcp.json'),
  },
  'claude-desktop': {
    label: 'Claude Desktop',
    key: 'mcpServers',
    user: () => {
      if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      }
      if (process.platform === 'win32') {
        return path.join(appData(), 'Claude', 'claude_desktop_config.json');
      }
      return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
    },
    project: () => null,
  },
  cursor: {
    label: 'Cursor',
    key: 'mcpServers',
    user: () => path.join(os.homedir(), '.cursor', 'mcp.json'),
    project: (cwd) => path.join(cwd, '.cursor', 'mcp.json'),
  },
  windsurf: {
    label: 'Windsurf',
    key: 'mcpServers',
    user: () => path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    project: () => null,
  },
  vscode: {
    label: 'VS Code',
    key: 'servers',
    user: () => {
      if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
      }
      if (process.platform === 'win32') {
        return path.join(appData(), 'Code', 'User', 'mcp.json');
      }
      return path.join(os.homedir(), '.config', 'Code', 'User', 'mcp.json');
    },
    project: (cwd) => path.join(cwd, '.vscode', 'mcp.json'),
  },
};

export const CLIENT_ALIASES = {
  'claude-code': 'claude',
  claudecode: 'claude',
  desktop: 'claude-desktop',
  claude_desktop: 'claude-desktop',
  code: 'vscode',
  'vs-code': 'vscode',
};

export function normalizeClient(name) {
  const key = String(name || '').toLowerCase();
  return CLIENT_ALIASES[key] || key;
}

export function resolveConfigPath(clientName, scope, cwd = process.cwd()) {
  const client = CLIENTS[clientName];
  if (!client) {
    throw new Error(
      `Unknown client "${clientName}". Supported: ${Object.keys(CLIENTS).join(', ')}.`
    );
  }
  const resolver = scope === 'project' ? client.project : client.user;
  const configPath = resolver(cwd);
  if (!configPath) {
    throw new Error(`${client.label} has no ${scope}-scoped MCP config. Try --scope user.`);
  }
  return configPath;
}

/**
 * True when this package is running from an installed copy (registry or
 * global install) rather than from a source checkout.
 */
export function isInstalledCopy() {
  return PACKAGE_ROOT.split(path.sep).includes('node_modules');
}

export function buildServerEntry({ apiUrl, token, useNpx } = {}) {
  const viaNpx = useNpx ?? isInstalledCopy();
  const entry = viaNpx
    ? { command: 'npx', args: ['-y', 'eromify-mcp', 'serve'] }
    : { command: process.execPath, args: [BIN_PATH, 'serve'] };

  entry.env = { EROMIFY_API_URL: apiUrl || DEFAULT_API_URL };
  if (token) entry.env.EROMIFY_API_TOKEN = token;
  return entry;
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${file} is not valid JSON (${error.message}). Fix or move it, then retry.`);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Add (or replace) the Eromify server in a client's MCP config.
 * Returns a summary of what changed; makes no writes when `dryRun` is set.
 */
export function install({
  client: clientName,
  scope = 'user',
  serverName = 'eromify',
  apiUrl,
  token,
  useNpx,
  force = false,
  dryRun = false,
  cwd = process.cwd(),
}) {
  const client = CLIENTS[clientName];
  const configPath = resolveConfigPath(clientName, scope, cwd);
  const config = readJson(configPath);
  const servers = config[client.key] && typeof config[client.key] === 'object' ? config[client.key] : {};
  const existed = Object.prototype.hasOwnProperty.call(servers, serverName);

  if (existed && !force) {
    return { status: 'exists', configPath, serverName, key: client.key, label: client.label };
  }

  const entry = buildServerEntry({ apiUrl, token, useNpx });
  const next = { ...config, [client.key]: { ...servers, [serverName]: entry } };

  let backupPath = null;
  if (!dryRun) {
    if (fs.existsSync(configPath)) {
      backupPath = `${configPath}.eromify-backup`;
      fs.copyFileSync(configPath, backupPath);
    }
    writeJson(configPath, next);
  }

  return {
    status: dryRun ? 'dry-run' : existed ? 'replaced' : 'installed',
    configPath,
    backupPath,
    serverName,
    key: client.key,
    label: client.label,
    entry,
  };
}

export function uninstall({ client: clientName, scope = 'user', serverName = 'eromify', cwd = process.cwd() }) {
  const client = CLIENTS[clientName];
  const configPath = resolveConfigPath(clientName, scope, cwd);
  const config = readJson(configPath);
  const servers = config[client.key];

  if (!servers || !Object.prototype.hasOwnProperty.call(servers, serverName)) {
    return { status: 'absent', configPath, serverName, label: client.label };
  }

  delete servers[serverName];
  writeJson(configPath, config);
  return { status: 'removed', configPath, serverName, label: client.label };
}

/** Where each client's config lives, and whether Eromify is already in it. */
export function status({ serverName = 'eromify', cwd = process.cwd() } = {}) {
  return Object.entries(CLIENTS).flatMap(([name, client]) =>
    ['user', 'project']
      .map((scope) => {
        const configPath = (scope === 'project' ? client.project : client.user)(cwd);
        if (!configPath) return null;
        let installed = false;
        let exists = fs.existsSync(configPath);
        if (exists) {
          try {
            installed = Boolean(readJson(configPath)?.[client.key]?.[serverName]);
          } catch {
            exists = false;
          }
        }
        return { client: name, label: client.label, scope, configPath, exists, installed };
      })
      .filter(Boolean)
  );
}
