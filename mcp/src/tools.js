const NICHES = [
  'fashion', 'fitness', 'lifestyle', 'tech', 'food',
  'travel', 'beauty', 'gaming', 'business', 'other',
];
const CONTENT_TYPES = ['post', 'story', 'reel', 'bio', 'caption'];
const TONES = ['professional', 'casual', 'funny', 'inspirational', 'educational', 'promotional'];
const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube'];

const influencerProperties = {
  name: { type: 'string', minLength: 2, maxLength: 100, description: 'Display name of the influencer.' },
  description: {
    type: 'string', minLength: 10, maxLength: 1000,
    description: 'Who this influencer is — appearance, backstory and what they post about.',
  },
  niche: { type: 'string', enum: NICHES, description: 'Primary content niche.' },
  personality: {
    type: 'string', minLength: 10, maxLength: 500,
    description: 'Voice and personality traits, e.g. "warm, self-deprecating, very online".',
  },
  targetAudience: {
    type: 'string', minLength: 10, maxLength: 500,
    description: 'Who the influencer is speaking to, e.g. "US women 18-30 into streetwear".',
  },
  contentStyle: {
    type: 'string', minLength: 10, maxLength: 500,
    description: 'How posts should look and read, e.g. "film-grain selfies, short lowercase captions".',
  },
};
const influencerRequired = Object.keys(influencerProperties);

/**
 * Every tool the server exposes. `run` receives the validated-by-client
 * arguments plus an EromifyClient and returns a JSON-serialisable result.
 */
export const TOOLS = [
  {
    name: 'eromify_list_influencers',
    title: 'List influencers',
    description:
      'List every AI influencer belonging to the authenticated Eromify account, newest first. ' +
      'Start here when you need an influencer id for content generation.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (client) => client.get('/influencers'),
  },
  {
    name: 'eromify_get_influencer',
    title: 'Get influencer',
    description: 'Fetch one AI influencer by id, including its niche, personality and stored face image.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Influencer id (UUID).' } },
      required: ['id'],
      additionalProperties: false,
    },
    run: (client, { id }) => client.get(`/influencers/${encodeURIComponent(id)}`),
  },
  {
    name: 'eromify_create_influencer',
    title: 'Create influencer',
    description:
      'Create a new AI influencer. Counts against the account plan limit ' +
      '(free 3, basic 10, pro 50, enterprise 200) — check eromify_get_usage first if unsure.',
    inputSchema: {
      type: 'object',
      properties: influencerProperties,
      required: influencerRequired,
      additionalProperties: false,
    },
    run: (client, args) => client.post('/influencers', args),
  },
  {
    name: 'eromify_update_influencer',
    title: 'Update influencer',
    description:
      'Replace an influencer\'s profile. The API validates the full object, so pass every field — ' +
      'read the current values with eromify_get_influencer and change only what you mean to.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Influencer id (UUID).' },
        ...influencerProperties,
      },
      required: ['id', ...influencerRequired],
      additionalProperties: false,
    },
    run: (client, { id, ...body }) => client.put(`/influencers/${encodeURIComponent(id)}`, body),
  },
  {
    name: 'eromify_delete_influencer',
    title: 'Delete influencer',
    description: 'Permanently delete an AI influencer. This cannot be undone.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Influencer id (UUID).' } },
      required: ['id'],
      additionalProperties: false,
    },
    run: (client, { id }) => client.delete(`/influencers/${encodeURIComponent(id)}`),
  },
  {
    name: 'eromify_generate_content',
    title: 'Generate written content',
    description:
      'Generate written content (post, story, reel script, bio or caption) in an influencer\'s voice, ' +
      'tuned for one platform. Returns the text; it is also saved to the account content library.',
    inputSchema: {
      type: 'object',
      properties: {
        influencerId: { type: 'string', description: 'Influencer id (UUID) whose voice to write in.' },
        contentType: { type: 'string', enum: CONTENT_TYPES, description: 'What to write.' },
        topic: { type: 'string', minLength: 3, maxLength: 200, description: 'What the content is about.' },
        tone: { type: 'string', enum: TONES, description: 'Tone of voice.' },
        platform: { type: 'string', enum: PLATFORMS, description: 'Destination platform.' },
        additionalContext: {
          type: 'string', maxLength: 500,
          description: 'Optional extra direction, e.g. a campaign angle or a call to action.',
        },
      },
      required: ['influencerId', 'contentType', 'topic', 'tone', 'platform'],
      additionalProperties: false,
    },
    run: (client, args) => client.post('/content/generate', args),
  },
  {
    name: 'eromify_generate_image',
    title: 'Generate image',
    description:
      'Generate an image for an influencer, reusing their stored face image for consistency. ' +
      'Spends account credits and returns the hosted image URL.',
    inputSchema: {
      type: 'object',
      properties: {
        influencerId: { type: 'string', description: 'Influencer id (UUID).' },
        prompt: { type: 'string', description: 'What the image should show. The influencer profile is appended automatically.' },
        style: { type: 'string', description: 'Optional visual style, e.g. "photorealistic", "film photography". Defaults to photorealistic.' },
        size: { type: 'string', description: 'Optional dimensions, e.g. "1024x1024" (default).' },
      },
      required: ['influencerId', 'prompt'],
      additionalProperties: false,
    },
    run: (client, args) => client.post('/content/generate-image', args),
  },
  {
    name: 'eromify_generate_video',
    title: 'Generate video',
    description:
      'Start an image-to-video generation. Spends account credits and returns a jobId immediately — ' +
      'poll eromify_get_video_status until it reports completed to get the video URL.',
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL of the source image to animate, e.g. one returned by eromify_generate_image.' },
        prompt: { type: 'string', description: 'How the image should move.' },
        duration: { type: 'number', description: 'Clip length in seconds (default 5).' },
        influencerId: { type: 'string', description: 'Optional influencer id (UUID) to file the clip under.' },
      },
      required: ['imageUrl', 'prompt'],
      additionalProperties: false,
    },
    run: (client, args) => client.post('/content/generate-video', args),
  },
  {
    name: 'eromify_get_video_status',
    title: 'Check video status',
    description:
      'Check a video generation job. Returns status and, once completed, the video URL. ' +
      'Generation usually takes a minute or more, so space out polls.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: { jobId: { type: 'string', description: 'Job id returned by eromify_generate_video.' } },
      required: ['jobId'],
      additionalProperties: false,
    },
    run: (client, { jobId }) => client.get(`/content/video-status/${encodeURIComponent(jobId)}`),
  },
  {
    name: 'eromify_list_content',
    title: 'List generated content',
    description: 'Page through previously generated content for the account, newest first, optionally filtered to one influencer.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, description: 'Page number (default 1).' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Items per page (default 20).' },
        influencerId: { type: 'string', description: 'Optional influencer id (UUID) to filter by.' },
      },
      additionalProperties: false,
    },
    run: (client, args) => client.get('/content', { query: args }),
  },
  {
    name: 'eromify_get_content',
    title: 'Get content item',
    description: 'Fetch one generated content item by id, with the influencer it belongs to.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Content id (UUID).' } },
      required: ['id'],
      additionalProperties: false,
    },
    run: (client, { id }) => client.get(`/content/${encodeURIComponent(id)}`),
  },
  {
    name: 'eromify_delete_content',
    title: 'Delete content item',
    description: 'Permanently delete a generated content item. This cannot be undone.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Content id (UUID).' } },
      required: ['id'],
      additionalProperties: false,
    },
    run: (client, { id }) => client.delete(`/content/${encodeURIComponent(id)}`),
  },
  {
    name: 'eromify_get_profile',
    title: 'Get account profile',
    description: 'Get the authenticated user\'s Eromify profile, including remaining credits.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (client) => client.get('/users/profile'),
  },
  {
    name: 'eromify_get_dashboard',
    title: 'Get dashboard summary',
    description: 'Get the account dashboard: influencer and content counts, recent activity and plan status.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (client) => client.get('/users/dashboard'),
  },
  {
    name: 'eromify_get_usage',
    title: 'Get plan usage',
    description: 'Get this month\'s content usage against the plan limits, and how much headroom is left.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (client) => client.get('/analytics/usage'),
  },
  {
    name: 'eromify_get_analytics',
    title: 'Get analytics',
    description:
      'Get analytics for the whole account, or for one influencer when influencerId is given.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: { influencerId: { type: 'string', description: 'Optional influencer id (UUID) to scope the report.' } },
      additionalProperties: false,
    },
    run: (client, { influencerId }) =>
      influencerId
        ? client.get(`/analytics/influencer/${encodeURIComponent(influencerId)}`)
        : client.get('/analytics/dashboard'),
  },
  {
    name: 'eromify_get_subscription',
    title: 'Get subscription',
    description: 'Get the account\'s current subscription: plan, status and renewal date.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (client) => client.get('/users/subscription'),
  },
  {
    name: 'eromify_get_pricing_plans',
    title: 'Get pricing plans',
    description: 'List the available Eromify plans with prices and included features. Does not require a token.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (client) => client.get('/payments/pricing-plans', { auth: false }),
  },
];

/** Tool list in the shape the MCP `tools/list` response expects. */
export function toolDescriptors() {
  return TOOLS.map(({ name, title, description, inputSchema, readOnly, destructive }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations: {
      title,
      readOnlyHint: Boolean(readOnly),
      destructiveHint: Boolean(destructive),
      idempotentHint: Boolean(readOnly),
      openWorldHint: true,
    },
  }));
}

export function findTool(name) {
  return TOOLS.find((tool) => tool.name === name);
}
