import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_API_URL = 'https://eromify-backend.onrender.com/api';

/** Where the CLI persists a token obtained via `eromify-mcp login`. */
export const CONFIG_DIR = path.join(os.homedir(), '.eromify');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function readStoredConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeStoredConfig(patch) {
  const merged = { ...readStoredConfig(), ...patch };
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  return merged;
}

/**
 * Resolve settings from, in order of precedence: explicit overrides,
 * environment, the stored config file, then built-in defaults.
 */
export function resolveConfig(overrides = {}) {
  const stored = readStoredConfig();
  const apiUrl =
    overrides.apiUrl || process.env.EROMIFY_API_URL || stored.apiUrl || DEFAULT_API_URL;
  const token = overrides.token || process.env.EROMIFY_API_TOKEN || stored.token || null;
  return { apiUrl: apiUrl.replace(/\/+$/, ''), token };
}
