# eromify-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for Eromify. It gives Claude
(and any other MCP client) tools to manage AI influencers and generate content through the Eromify
backend API, so you can work with your account from a chat session instead of the dashboard.

## Install

The package lives in this repository under `mcp/`. Until it is published to npm, install it from
the checkout:

```bash
# from the repository root
npm install --prefix mcp        # one-time, installs the MCP SDK
npx ./mcp install --client claude
```

Or install it globally so `eromify-mcp` is on your PATH:

```bash
npm install -g ./mcp
eromify-mcp install --client claude
```

Once the package is published, the same command works straight from the registry:

```bash
npx eromify-mcp install --client claude
```

`install` writes an entry into the client's MCP config, backing up the existing file first
(`<config>.eromify-backup`) and leaving every other server in place. When run from this checkout
it points the client at your local copy; when run from an installed package it uses
`npx -y eromify-mcp`. Force either with `--npx`.

Supported clients:

| `--client` | Application | Config written |
| --- | --- | --- |
| `claude` | Claude Code | `~/.claude.json`, or `./.mcp.json` with `--scope project` |
| `claude-desktop` | Claude Desktop | `claude_desktop_config.json` for your platform |
| `cursor` | Cursor | `~/.cursor/mcp.json`, or `./.cursor/mcp.json` |
| `windsurf` | Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| `vscode` | VS Code | `mcp.json` (uses the `servers` key) |

Restart the client afterwards so it picks up the new server.

## Authenticate

The server talks to the Eromify API as you, using a bearer token:

```bash
eromify-mcp login              # prompts for email and password
eromify-mcp doctor             # confirms the API is reachable and the token works
```

`login` stores the token in `~/.eromify/config.json` (mode 0600). The server reads it from there,
so the token is never written into a client config file that you might share or commit. If you do
want it inline — for a client that runs the server with a scrubbed environment — pass
`--embed-token` to `install`.

Settings resolve in this order: CLI flag → environment → `~/.eromify/config.json` → default.

| Variable | Purpose |
| --- | --- |
| `EROMIFY_API_URL` | API base URL (default `https://eromify-backend.onrender.com/api`) |
| `EROMIFY_API_TOKEN` | Bearer token, equivalent to `eromify-mcp login` |
| `EROMIFY_TIMEOUT_MS` | Request timeout, default 120000 — image and video calls are slow |

## Tools

Influencers: `eromify_list_influencers`, `eromify_get_influencer`, `eromify_create_influencer`,
`eromify_update_influencer`, `eromify_delete_influencer`.

Generation: `eromify_generate_content` (posts, stories, reels, bios, captions),
`eromify_generate_image` (face-consistent images), `eromify_generate_video` and
`eromify_get_video_status` (asynchronous — the first returns a job id, the second resolves it into
a URL).

Library: `eromify_list_content`, `eromify_get_content`, `eromify_delete_content`.

Account: `eromify_get_profile`, `eromify_get_dashboard`, `eromify_get_usage`,
`eromify_get_analytics`, `eromify_get_subscription`, `eromify_get_pricing_plans`.

`eromify-mcp tools` prints the full list with descriptions. Read-only tools are annotated as such,
and the two delete tools are annotated destructive, so clients can gate them behind a confirmation.

The backend's `/content/upscale-image` endpoint is deliberately not exposed: it is currently a
placeholder that returns the original image unchanged, so a tool for it would only mislead the
model. Add it here once real upscaling is wired up.

Image and video generation spend account credits. The server tells the model to check
`eromify_get_profile` or `eromify_get_usage` before large batches, and surfaces a 402 from the API
as a clear "out of credits" error rather than a generic failure.

## Other commands

```bash
eromify-mcp serve                        # run the server on stdio (what clients invoke)
eromify-mcp status                       # where the server is installed, per client
eromify-mcp uninstall --client claude    # remove the entry again
eromify-mcp logout                       # forget the stored token
eromify-mcp --help
```

Useful flags: `--scope project`, `--name <server-name>`, `--api-url <url>`, `--force`, `--dry-run`.

## Releasing

Publishing is deliberate: nothing goes to npm on a merge. `.github/workflows/publish-mcp.yml`
runs the test suite and the CLI smoke checks, then publishes with
[provenance](https://docs.npmjs.com/generating-provenance-statements).

One-time setup: create an npm **automation** token with publish rights and add it to the
repository as a secret named `NPM_TOKEN` (Settings → Secrets and variables → Actions).

To cut a release, bump the version and push a matching tag:

```bash
npm version patch --prefix mcp     # or minor / major
git push origin main --follow-tags
git tag eromify-mcp-v$(node -p "require('./mcp/package.json').version")
git push origin --tags
```

The workflow refuses to publish if the tag's version disagrees with `package.json` — a
mismatch would ship the wrong version under the right name, which npm will not let you undo.
Run it from the Actions tab with **Dry run** checked to validate without publishing.

Once published, `npx eromify-mcp install --client claude` works from anywhere, and `install`
writes `npx -y eromify-mcp` into client configs instead of a local path.

## Development

Requires Node 20 or newer.

```bash
npm install --prefix mcp
npm test --prefix mcp
```

The test suite starts a stub Eromify API, launches the real server as a subprocess, and drives it
with an MCP client over stdio — checking the tool surface, bearer auth, URL encoding and error
mapping — then exercises the config installer against a temporary home directory.

`.github/workflows/mcp.yml` runs the same suite on Node 20 and 22 for every push and pull request
that touches `mcp/`, and smoke-checks that the CLI's `--help`, `tools` and `install --dry-run`
paths still run.
