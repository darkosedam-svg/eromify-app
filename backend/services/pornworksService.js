/**
 * PornWorks image-to-video provider.
 *
 * Same interface as runwayService: generateVideoFromImage() starts a job and
 * checkGenerationStatus() reports on it. Selected with VIDEO_PROVIDER=pornworks.
 *
 * Configuration (backend/.env):
 *   PORNWORKS_API_KEY     API key from the project page at
 *                         https://pornworks.com/en/api/projects (required)
 *   PORNWORKS_API_BASE    Base URL of the API, without a trailing slash (required)
 *   PORNWORKS_AUTH_HEADER Header that carries the key (default: Authorization)
 *   PORNWORKS_AUTH_PREFIX Text placed before the key in that header
 *                         (default: "Bearer "; set to "" for X-API-Key style)
 *   PORNWORKS_TIMEOUT_MS  Per-request timeout (default: 60000)
 *
 * ---------------------------------------------------------------------------
 * API CONTRACT — the only part of this file that depends on PornWorks' docs.
 *
 * Everything PornWorks-specific lives in the three functions below the
 * CONTRACT marker: the endpoint paths, the request body, and how a status
 * response is read. The status reader already accepts the field names most
 * async generation APIs use, so a mismatch shows up as a job stuck in
 * "queued" rather than a crash. Confirm these against the API project page
 * and adjust in one place.
 * ---------------------------------------------------------------------------
 */

const DEFAULT_TIMEOUT_MS = 60_000;

function config() {
  const apiKey = process.env.PORNWORKS_API_KEY;
  const apiBase = (process.env.PORNWORKS_API_BASE || '').replace(/\/+$/, '');
  if (!apiKey) {
    throw new Error(
      'PORNWORKS_API_KEY is not set. Create a key at https://pornworks.com/en/api/projects and put it in backend/.env'
    );
  }
  if (!apiBase) {
    throw new Error(
      'PORNWORKS_API_BASE is not set. Use the base URL shown on https://pornworks.com/en/api/projects'
    );
  }
  const authHeader = process.env.PORNWORKS_AUTH_HEADER || 'Authorization';
  const authPrefix = process.env.PORNWORKS_AUTH_PREFIX ?? 'Bearer ';
  const timeoutMs = Number(process.env.PORNWORKS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  return { apiKey, apiBase, authHeader, authPrefix, timeoutMs };
}

// ======================= CONTRACT (confirm against docs) =======================

/** Where a new image-to-video job is created. */
function createRequest(imageUrl, prompt, { duration = 5 } = {}) {
  return {
    method: 'POST',
    path: '/video/image-to-video',
    body: {
      image_url: imageUrl,
      prompt,
      duration,
    },
  };
}

/** Where a job's status is read. */
function statusRequest(jobId) {
  return { method: 'GET', path: `/video/${encodeURIComponent(jobId)}` };
}

/**
 * Normalise a PornWorks job payload to the shape the rest of the backend
 * expects. Tolerant of the common spellings so a renamed field degrades to
 * "still processing" rather than an exception.
 */
function readJob(payload) {
  const job = payload?.data ?? payload?.job ?? payload ?? {};
  const rawStatus = String(job.status ?? job.state ?? '').toLowerCase();
  const videoUrl =
    job.video_url ??
    job.videoUrl ??
    job.output?.video_url ??
    job.output?.url ??
    (Array.isArray(job.output) ? job.output[0] : undefined) ??
    job.result?.video_url ??
    job.result?.url ??
    job.url ??
    null;

  return {
    jobId: String(job.id ?? job.job_id ?? job.jobId ?? job.task_id ?? ''),
    status: normaliseStatus(rawStatus, videoUrl),
    progress: Number(job.progress ?? 0) || 0,
    videoUrl,
    error: job.error?.message ?? job.error ?? job.detail ?? null,
    createdAt: job.created_at ?? job.createdAt ?? null,
    completedAt: job.completed_at ?? job.completedAt ?? null,
  };
}

// ============================== end CONTRACT ==================================

const STATUS_MAP = {
  queued: 'queued',
  pending: 'queued',
  waiting: 'queued',
  submitted: 'queued',
  processing: 'processing',
  running: 'processing',
  in_progress: 'processing',
  started: 'processing',
  generating: 'processing',
  completed: 'completed',
  complete: 'completed',
  done: 'completed',
  succeeded: 'completed',
  success: 'completed',
  finished: 'completed',
  failed: 'failed',
  error: 'failed',
  errored: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
  expired: 'failed',
};

function normaliseStatus(rawStatus, videoUrl) {
  if (STATUS_MAP[rawStatus]) return STATUS_MAP[rawStatus];
  // An unknown status with a video attached is finished; without one it is
  // still running as far as the client is concerned.
  return videoUrl ? 'completed' : 'queued';
}

async function request({ method, path, body }) {
  const { apiKey, apiBase, authHeader, authPrefix, timeoutMs } = config();
  const headers = {
    Accept: 'application/json',
    [authHeader]: `${authPrefix}${apiKey}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail =
      payload?.error?.message ?? payload?.error ?? payload?.message ?? payload?.detail ?? text;
    throw new Error(`PornWorks API error ${response.status}: ${detail}`);
  }
  return payload;
}

/**
 * Start an image-to-video generation.
 * @param {string} imageUrl - Source image to animate
 * @param {string} prompt - Motion prompt
 * @param {object} options - { duration }
 * @returns {Promise<{jobId: string, status: string, createdAt: string|null}>}
 */
async function generateVideoFromImage(imageUrl, prompt, options = {}) {
  try {
    const payload = await request(createRequest(imageUrl, prompt, options));
    const job = readJob(payload);
    if (!job.jobId) {
      throw new Error(`response carried no job id: ${JSON.stringify(payload).slice(0, 200)}`);
    }
    return { jobId: job.jobId, status: job.status, createdAt: job.createdAt };
  } catch (error) {
    console.error('PornWorks video generation error:', error);
    throw new Error(`Failed to generate video: ${error.message}`);
  }
}

/**
 * Check a generation job.
 * @param {string} jobId
 * @returns {Promise<{jobId, status, progress, videoUrl, error, createdAt, completedAt}>}
 */
async function checkGenerationStatus(jobId) {
  try {
    const payload = await request(statusRequest(jobId));
    const job = readJob(payload);
    return { ...job, jobId: job.jobId || jobId };
  } catch (error) {
    console.error('PornWorks status check error:', error);
    throw new Error(`Failed to check status: ${error.message}`);
  }
}

module.exports = {
  generateVideoFromImage,
  checkGenerationStatus,
  // Exported for tests and for adjusting the contract without a running server.
  createRequest,
  statusRequest,
  readJob,
};
