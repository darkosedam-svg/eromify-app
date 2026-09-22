/**
 * Video generation provider registry.
 *
 * The route layer talks to this module only. Which provider actually runs a
 * job is chosen by VIDEO_PROVIDER (default: runway), so switching to a
 * different generator is a config change, not a code change.
 *
 * Job ids handed to clients carry the provider name as a prefix
 * ("pornworks:abc123"). A status check therefore always goes back to the
 * provider that created the job, even if VIDEO_PROVIDER changes between the
 * two calls. Bare ids, created before prefixes existed, belong to Runway.
 */
const PROVIDERS = {
  runway: () => require('../runwayService'),
  pornworks: () => require('../pornworksService'),
};

const DEFAULT_PROVIDER = 'runway';

function providerName() {
  const name = (process.env.VIDEO_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  if (!PROVIDERS[name]) {
    throw new Error(
      `Unknown VIDEO_PROVIDER "${name}". Known providers: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return name;
}

function encodeJobId(provider, id) {
  return `${provider}:${id}`;
}

function decodeJobId(jobId) {
  const match = /^([a-z0-9_-]+):(.+)$/i.exec(String(jobId));
  if (match && PROVIDERS[match[1].toLowerCase()]) {
    return { provider: match[1].toLowerCase(), id: match[2] };
  }
  return { provider: DEFAULT_PROVIDER, id: String(jobId) };
}

/**
 * Start an image-to-video job with the configured provider.
 * @returns {Promise<{jobId: string, status: string, provider: string}>}
 */
async function generateVideoFromImage(imageUrl, prompt, options = {}) {
  const provider = providerName();
  const job = await PROVIDERS[provider]().generateVideoFromImage(imageUrl, prompt, options);
  return { ...job, provider, jobId: encodeJobId(provider, job.jobId) };
}

/**
 * Check a job with whichever provider created it.
 * @returns {Promise<{jobId: string, status: string, videoUrl: string|null, provider: string}>}
 */
async function checkGenerationStatus(jobId) {
  const { provider, id } = decodeJobId(jobId);
  const status = await PROVIDERS[provider]().checkGenerationStatus(id);
  return { ...status, provider, jobId };
}

module.exports = {
  PROVIDER_NAMES: Object.keys(PROVIDERS),
  DEFAULT_PROVIDER,
  providerName,
  encodeJobId,
  decodeJobId,
  generateVideoFromImage,
  checkGenerationStatus,
};
