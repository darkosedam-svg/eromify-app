import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { EromifyClient } from './client.js';
import { findTool, toolDescriptors } from './tools.js';

export const SERVER_NAME = 'eromify';
export const SERVER_VERSION = '0.1.0';

const INSTRUCTIONS = [
  'Eromify manages AI influencers and the images, videos and captions they post.',
  'Influencer ids are UUIDs — call eromify_list_influencers to find one before generating content.',
  'Image and video generation spend account credits; check eromify_get_profile or eromify_get_usage',
  'before running a batch, and confirm with the user first when a request would spend a lot.',
  'Video generation is asynchronous: eromify_generate_video returns a jobId that',
  'eromify_get_video_status resolves into a URL once the render finishes.',
].join(' ');

export function createServer(clientOverrides = {}) {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );

  const client = new EromifyClient(clientOverrides);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDescriptors(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = findTool(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      };
    }

    try {
      const result = await tool.run(client, request.params.arguments ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: isPlainObject(result) ? result : { result },
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: describeError(error) }],
      };
    }
  });

  return server;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Turn an API failure into a message the model can act on. */
function describeError(error) {
  const base = error?.message || String(error);
  switch (error?.status) {
    case 401:
      return `${base}\n\nThe Eromify API token is missing or expired. Run \`eromify-mcp login\` to refresh it.`;
    case 402:
      return `${base}\n\nThe account is out of credits. Suggest topping up before retrying.`;
    case 403:
      return `${base}\n\nThe account's plan does not allow this. Check eromify_get_subscription and eromify_get_usage.`;
    case 404:
      return `${base}\n\nNothing matched that id. List the available records first.`;
    default:
      return base;
  }
}

export async function serve(clientOverrides = {}) {
  const server = createServer(clientOverrides);
  await server.connect(new StdioServerTransport());
  return server;
}
