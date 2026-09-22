/**
 * Video provider selection and the PornWorks adapter, driven against a stub
 * HTTP server that implements the contract in services/pornworksService.js.
 *
 * When PornWorks' real docs differ from that contract, update the contract
 * functions and this stub together.
 */
const assert = require('node:assert/strict');
const http = require('node:http');

const requests = [];

function startStub() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');

      if (req.headers.authorization !== 'Bearer pw-test-key') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
      } else if (req.method === 'POST' && req.url === '/video/image-to-video') {
        res.end(JSON.stringify({ id: 'job_123', status: 'queued', created_at: '2026-09-22T00:00:00Z' }));
      } else if (req.method === 'GET' && req.url === '/video/job_123') {
        res.end(JSON.stringify({ id: 'job_123', status: 'done', video_url: 'https://cdn.example/v.mp4', completed_at: '2026-09-22T00:01:00Z' }));
      } else if (req.method === 'GET' && req.url === '/video/job_moderated') {
        res.end(JSON.stringify({ id: 'job_moderated', status: 'failed', error: 'content policy' }));
      } else if (req.method === 'GET' && req.url === '/video/job_odd') {
        // Field names nobody documented: must still count as "in flight".
        res.end(JSON.stringify({ data: { task_id: 'job_odd', state: 'rendering' } }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: 'not found' }));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run() {
  // The adapters log every failure; the failures below are deliberate.
  console.error = () => {};
  const stub = await startStub();
  const base = `http://127.0.0.1:${stub.address().port}`;

  const video = require('../services/video');
  const pornworks = require('../services/pornworksService');

  // --- provider selection -------------------------------------------------
  delete process.env.VIDEO_PROVIDER;
  assert.equal(video.providerName(), 'runway', 'Runway stays the default');

  process.env.VIDEO_PROVIDER = 'nope';
  assert.throws(() => video.providerName(), /Unknown VIDEO_PROVIDER "nope"/);

  process.env.VIDEO_PROVIDER = ' PornWorks ';
  assert.equal(video.providerName(), 'pornworks', 'provider name is trimmed and case-insensitive');
  console.log('✓ VIDEO_PROVIDER selects the provider and rejects unknown names');

  // --- job id routing -----------------------------------------------------
  assert.deepEqual(video.decodeJobId('pornworks:abc'), { provider: 'pornworks', id: 'abc' });
  assert.deepEqual(video.decodeJobId('runway:abc'), { provider: 'runway', id: 'abc' });
  assert.deepEqual(video.decodeJobId('abc-legacy'), { provider: 'runway', id: 'abc-legacy' });
  assert.deepEqual(
    video.decodeJobId('mystery:abc'),
    { provider: 'runway', id: 'mystery:abc' },
    'an unknown prefix is part of the id, not a provider'
  );
  console.log('✓ job ids carry their provider; bare ids stay with Runway');

  // --- missing configuration fails loudly ---------------------------------
  delete process.env.PORNWORKS_API_KEY;
  delete process.env.PORNWORKS_API_BASE;
  await assert.rejects(
    () => video.generateVideoFromImage('https://img/x.png', 'wave'),
    /PORNWORKS_API_KEY is not set/
  );
  process.env.PORNWORKS_API_KEY = 'pw-test-key';
  await assert.rejects(
    () => video.generateVideoFromImage('https://img/x.png', 'wave'),
    /PORNWORKS_API_BASE is not set/
  );
  console.log('✓ missing PornWorks configuration names the variable to set');

  // --- the adapter against the stub ---------------------------------------
  process.env.PORNWORKS_API_BASE = `${base}/`; // trailing slash must be tolerated

  const job = await video.generateVideoFromImage('https://img/x.png', 'slow head turn', { duration: 5 });
  assert.equal(job.provider, 'pornworks');
  assert.equal(job.jobId, 'pornworks:job_123', 'client-facing id is prefixed with the provider');
  assert.equal(job.status, 'queued');

  const create = requests.at(-1);
  assert.equal(create.method, 'POST');
  assert.equal(create.url, '/video/image-to-video');
  assert.equal(create.headers.authorization, 'Bearer pw-test-key');
  assert.equal(create.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(create.body), { image_url: 'https://img/x.png', prompt: 'slow head turn', duration: 5 });
  console.log('✓ generateVideoFromImage posts the contract body with the API key');

  const done = await video.checkGenerationStatus('pornworks:job_123');
  assert.equal(requests.at(-1).url, '/video/job_123');
  assert.equal(done.provider, 'pornworks');
  assert.equal(done.jobId, 'pornworks:job_123', 'status echoes the prefixed id the client sent');
  assert.equal(done.status, 'completed', '"done" normalises to the status the frontend polls for');
  assert.equal(done.videoUrl, 'https://cdn.example/v.mp4');
  assert.equal(done.completedAt, '2026-09-22T00:01:00Z');
  console.log('✓ checkGenerationStatus normalises a finished job');

  const failed = await video.checkGenerationStatus('pornworks:job_moderated');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'content policy');
  console.log('✓ a rejected job reports failed with the provider reason');

  const odd = await video.checkGenerationStatus('pornworks:job_odd');
  assert.equal(odd.status, 'queued', 'unrecognised status without a video counts as in flight');
  assert.equal(odd.videoUrl, null);
  console.log('✓ unexpected field names degrade to "still running", not a crash');

  // --- error surfaces -----------------------------------------------------
  process.env.PORNWORKS_API_KEY = 'wrong';
  await assert.rejects(
    () => video.generateVideoFromImage('https://img/x.png', 'wave'),
    /PornWorks API error 401: invalid api key/
  );
  process.env.PORNWORKS_API_KEY = 'pw-test-key';
  await assert.rejects(() => video.checkGenerationStatus('pornworks:missing'), /PornWorks API error 404/);
  console.log('✓ HTTP errors carry the status and the provider message');

  // --- alternative auth header --------------------------------------------
  process.env.PORNWORKS_AUTH_HEADER = 'X-API-Key';
  process.env.PORNWORKS_AUTH_PREFIX = '';
  await assert.rejects(() => video.generateVideoFromImage('https://img/x.png', 'wave'), /401/);
  const alt = requests.at(-1);
  assert.equal(alt.headers['x-api-key'], 'pw-test-key');
  assert.equal(alt.headers.authorization, undefined);
  delete process.env.PORNWORKS_AUTH_HEADER;
  delete process.env.PORNWORKS_AUTH_PREFIX;
  console.log('✓ the auth header and prefix are configurable for X-API-Key style APIs');

  // --- readJob accepts the common response spellings ----------------------
  for (const [payload, expectedUrl] of [
    [{ id: 'a', status: 'completed', output: { video_url: 'u1' } }, 'u1'],
    [{ id: 'a', status: 'succeeded', output: ['u2'] }, 'u2'],
    [{ job: { job_id: 'a', status: 'finished', result: { url: 'u3' } } }, 'u3'],
    [{ id: 'a', status: 'weird', url: 'u4' }, 'u4'],
  ]) {
    const parsed = pornworks.readJob(payload);
    assert.equal(parsed.videoUrl, expectedUrl);
    assert.equal(parsed.status, 'completed');
  }
  console.log('✓ readJob finds the video URL under the usual field names');

  stub.close();
  console.log('\nAll video provider tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
