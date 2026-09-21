/**
 * End-to-end check: speak MCP to the real server over stdio against a stub
 * Eromify API, and exercise the install writer against a temp HOME.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BIN = fileURLToPath(new URL('../bin/eromify-mcp.js', import.meta.url));
const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const requests = [];

function startStubApi() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/influencers' && req.method === 'GET') {
        res.end(JSON.stringify({ success: true, influencers: [{ id: 'inf-1', name: 'Nova' }] }));
      } else if (req.url.startsWith('/api/content/video-status/')) {
        res.end(JSON.stringify({ success: true, status: 'completed', videoUrl: 'https://cdn/v.mp4' }));
      } else if (req.url === '/api/users/profile') {
        res.statusCode = 401;
        res.end(JSON.stringify({ success: false, error: 'Invalid token' }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ success: false, error: 'Route not found' }));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const api = await startStubApi();
  const apiUrl = `http://127.0.0.1:${api.address().port}/api`;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN, 'serve'],
    env: { ...process.env, EROMIFY_API_URL: apiUrl, EROMIFY_API_TOKEN: 'test-token' },
  });
  const client = new Client({ name: 'smoke-test', version: '0.0.0' });
  await client.connect(transport);

  // The version the server advertises must be the package version, so a
  // release bump in package.json cannot silently drift from what clients see.
  assert.equal(client.getServerVersion()?.version, PKG.version, 'server must report the package version');
  console.log('\u2713 server reports the package version');

  const { tools } = await client.listTools();
  assert.ok(tools.length >= 15, `expected the full tool surface, got ${tools.length}`);
  for (const tool of tools) {
    assert.match(tool.name, /^eromify_/, `${tool.name} should be namespaced`);
    assert.ok(tool.description?.length > 20, `${tool.name} needs a real description`);
    assert.equal(tool.inputSchema.type, 'object');
  }
  assert.ok(tools.find((t) => t.name === 'eromify_delete_influencer').annotations.destructiveHint);
  assert.ok(tools.find((t) => t.name === 'eromify_list_influencers').annotations.readOnlyHint);
  console.log(`✓ tools/list exposes ${tools.length} documented tools`);

  const list = await client.callTool({ name: 'eromify_list_influencers', arguments: {} });
  assert.equal(list.isError, undefined);
  assert.match(list.content[0].text, /Nova/);
  assert.equal(requests.at(-1).auth, 'Bearer test-token');
  console.log('✓ eromify_list_influencers calls GET /api/influencers with the bearer token');

  const video = await client.callTool({
    name: 'eromify_get_video_status',
    arguments: { jobId: 'job 42/x' },
  });
  assert.match(video.content[0].text, /completed/);
  assert.equal(requests.at(-1).url, '/api/content/video-status/job%2042%2Fx');
  console.log('✓ path parameters are URL-encoded');

  const paged = await client.callTool({
    name: 'eromify_list_content',
    arguments: { page: 2, limit: 5, influencerId: 'inf-1' },
  });
  assert.ok(paged.isError, 'stub returns 404 for this route');
  assert.match(paged.content[0].text, /List the available records first/);
  console.log('✓ API errors come back as tool errors with actionable guidance');

  const unauthorized = await client.callTool({ name: 'eromify_get_profile', arguments: {} });
  assert.ok(unauthorized.isError);
  assert.match(unauthorized.content[0].text, /eromify-mcp login/);
  console.log('✓ 401 responses tell the caller how to re-authenticate');

  const unknown = await client.callTool({ name: 'eromify_nope', arguments: {} });
  assert.ok(unknown.isError);
  console.log('✓ unknown tool names are reported, not thrown');

  await client.close();
  api.close();

  await checkInstaller();
  console.log('\nAll smoke tests passed.');
}

async function checkInstaller() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'eromify-home-'));
  const { install, uninstall } = await import('../src/install.js');
  const original = os.homedir;
  os.homedir = () => home;
  try {
    const claudeConfig = path.join(home, '.claude.json');
    fs.writeFileSync(claudeConfig, JSON.stringify({ mcpServers: { other: { command: 'x' } }, theme: 'dark' }));

    const result = install({ client: 'claude', scope: 'user', apiUrl: 'https://api.example/api' });
    assert.equal(result.status, 'installed');
    const written = JSON.parse(fs.readFileSync(claudeConfig, 'utf8'));
    assert.deepEqual(Object.keys(written.mcpServers).sort(), ['eromify', 'other']);
    assert.equal(written.theme, 'dark', 'unrelated settings must survive');
    assert.equal(written.mcpServers.eromify.env.EROMIFY_API_URL, 'https://api.example/api');
    assert.ok(!('EROMIFY_API_TOKEN' in written.mcpServers.eromify.env), 'no token embedded by default');
    assert.ok(fs.existsSync(`${claudeConfig}.eromify-backup`), 'existing config is backed up');
    console.log('✓ install merges into ~/.claude.json without clobbering other servers');

    assert.equal(install({ client: 'claude', scope: 'user' }).status, 'exists');
    assert.equal(install({ client: 'claude', scope: 'user', force: true }).status, 'replaced');
    console.log('✓ re-install is refused without --force');

    const dry = install({ client: 'vscode', scope: 'user', dryRun: true, token: 'tok' });
    assert.equal(dry.status, 'dry-run');
    assert.equal(dry.key, 'servers', 'VS Code uses the "servers" key');
    assert.equal(dry.entry.env.EROMIFY_API_TOKEN, 'tok');
    assert.ok(!fs.existsSync(dry.configPath), '--dry-run writes nothing');
    console.log('✓ --dry-run reports the entry without touching disk');

    assert.equal(uninstall({ client: 'claude', scope: 'user' }).status, 'removed');
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(claudeConfig, 'utf8')).mcpServers), ['other']);
    assert.equal(uninstall({ client: 'claude', scope: 'user' }).status, 'absent');
    console.log('✓ uninstall removes only the eromify entry');

    assert.throws(() => install({ client: 'windsurf', scope: 'project' }), /no project-scoped/);
    assert.throws(() => install({ client: 'nope' }), /Unknown client/);
    console.log('✓ unsupported client/scope combinations fail loudly');
  } finally {
    os.homedir = original;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
