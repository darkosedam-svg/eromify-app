# n8n integrations

Source for the n8n workflows that drive Eromify from the outside. These files are
the record of what was built — n8n itself holds the live copy, and this directory
is what you edit and re-import when you want to change it.

## `daily-content.workflow.js`

**Eromify - Daily Content Generation.** Every morning at 09:00 it fetches your
influencers and generates one Instagram caption for each.

```
Schedule 09:00
  -> GET  /api/influencers        Fetch Eromify Influencers
  -> Split Out `influencers`      One Item Per Influencer
  -> POST /api/content/generate   Generate Instagram Post
  -> Set                          Shape Draft For Review
```

The generate call sends `contentType: post`, `tone: casual`,
`platform: instagram`, a `topic` built from the influencer's niche and name, and
`additionalContext` from their `content_style`. The final Set node flattens each
result to `influencer`, `platform`, `topic`, `caption`, `contentId`,
`generatedAt` and `failure`.

`Generate Instagram Post` runs with `onError: 'continueRegularOutput'`, so one
influencer failing — out of credits, bad ID, a timeout — does not stop the run.
That item comes through with a `failure` message and no caption instead.

### Before it runs

1. **Fill in the `Eromify API` credential.** Both HTTP nodes reference it and it
   ships empty. Set header `Authorization` to `Bearer <your token>`. Get a token
   by logging in to the Eromify API, or run `eromify-mcp login` and read it out
   of `~/.eromify/config.json`.
2. **Activate the workflow.** It is imported inactive; the schedule does not fire
   until you turn it on.

Generation requires an active paid plan and spends account credits — a daily run
across N influencers costs N generations per day. The first call of the day may
also hit a cold-start delay on the backend.

### Editing it

The file is [n8n Workflow SDK](https://docs.n8n.io/) code: a restricted TypeScript
subset that an AST interpreter turns into a workflow graph. It is never executed,
so it has no dependencies and nothing to install. Edit it, then re-import through
the n8n MCP server (`validate_workflow`, then `update_workflow`) or paste it into
n8n's code import.

Two rules that are easy to trip over: every node needs an `output` array of
sample data, used to check that downstream expressions reference fields that
actually exist; and credentials are always declared with `newCredential('Name')`,
never a synthesized ID.

## Related

The [`mcp/`](../../mcp) directory holds `eromify-mcp`, which exposes the same API
to Claude and other MCP clients as tools.
