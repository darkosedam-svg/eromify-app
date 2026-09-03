import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const dailyTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: {
    name: 'Every Morning At 09:00',
    parameters: {
      rule: {
        interval: [{ field: 'days', triggerAtHour: 9, triggerAtMinute: 0 }]
      }
    },
    position: [380, 300]
  },
  output: [{}]
});

const fetchInfluencers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fetch Eromify Influencers',
    parameters: {
      method: 'GET',
      url: 'https://eromify-backend.onrender.com/api/influencers',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      options: {}
    },
    credentials: { httpTemplatedCustomAuth: newCredential('Eromify API') },
    position: [600, 300]
  },
  output: [{
    influencers: [
      { id: 'inf_123', name: 'Ava', niche: 'fashion', content_style: 'bright, playful, short sentences' }
    ]
  }]
});

const splitInfluencers = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: {
    name: 'One Item Per Influencer',
    parameters: {
      fieldToSplitOut: 'influencers',
      options: {}
    },
    position: [820, 300]
  },
  output: [{ id: 'inf_123', name: 'Ava', niche: 'fashion', content_style: 'bright, playful, short sentences' }]
});

const generatePost = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generate Instagram Post',
    parameters: {
      method: 'POST',
      url: 'https://eromify-backend.onrender.com/api/content/generate',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{\n'
        + '  "influencerId": "{{ $json.id }}",\n'
        + '  "contentType": "post",\n'
        + '  "topic": "{{ $json.niche }} update for {{ $json.name }}",\n'
        + '  "tone": "casual",\n'
        + '  "platform": "instagram",\n'
        + '  "additionalContext": "{{ $json.content_style }}"\n'
        + '}'),
      options: {}
    },
    credentials: { httpTemplatedCustomAuth: newCredential('Eromify API') },
    onError: 'continueRegularOutput',
    position: [1040, 300]
  },
  output: [{
    success: true,
    error: '',
    content: {
      id: 'cnt_456',
      text: 'Golden hour, gold heart. New drop lands Friday.',
      metadata: {
        influencer: 'Ava',
        platform: 'instagram',
        topic: 'fashion update for Ava',
        generatedAt: '2026-09-03T09:00:04.000Z'
      }
    }
  }]
});

const shapeResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Shape Draft For Review',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'influencer', name: 'influencer', value: expr('{{ $json.content.metadata.influencer }}'), type: 'string' },
          { id: 'platform', name: 'platform', value: expr('{{ $json.content.metadata.platform }}'), type: 'string' },
          { id: 'topic', name: 'topic', value: expr('{{ $json.content.metadata.topic }}'), type: 'string' },
          { id: 'caption', name: 'caption', value: expr('{{ $json.content.text }}'), type: 'string' },
          { id: 'contentId', name: 'contentId', value: expr('{{ $json.content.id }}'), type: 'string' },
          { id: 'generatedAt', name: 'generatedAt', value: expr('{{ $json.content.metadata.generatedAt }}'), type: 'string' },
          { id: 'failure', name: 'failure', value: expr('{{ $json.error }}'), type: 'string' }
        ]
      },
      options: {}
    },
    position: [1260, 300]
  },
  output: [{
    influencer: 'Ava',
    platform: 'instagram',
    topic: 'fashion update for Ava',
    caption: 'Golden hour, gold heart. New drop lands Friday.',
    contentId: 'cnt_456',
    generatedAt: '2026-09-03T09:00:04.000Z',
    failure: ''
  }]
});

const setupNotes = sticky(
  '## Eromify daily content\n\n'
    + 'Every morning at 09:00 this fetches your Eromify influencers and generates one Instagram caption for each.\n\n'
    + '**Before activating**, open either HTTP node and fill in the **Eromify API** credential:\n\n'
    + '- Header name: `Authorization`\n'
    + '- Header value: `Bearer YOUR_TOKEN`\n\n'
    + 'Get a token by logging in to the Eromify API, or run `eromify-mcp login` and copy the token from `~/.eromify/config.json`.\n\n'
    + 'Generation needs an active paid plan and spends account credits. "Generate Instagram Post" is set to continue on error, so a failed influencer shows up with a `failure` message instead of stopping the run.',
  [],
  { color: 4, width: 480, height: 340, position: [560, -60] }
);

export default workflow('eromify-daily-content', 'Eromify - Daily Content Generation')
  .add(setupNotes)
  .add(dailyTrigger)
  .to(fetchInfluencers)
  .to(splitInfluencers)
  .to(generatePost)
  .to(shapeResult);
