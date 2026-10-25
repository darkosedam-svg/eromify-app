/**
 * Regression tests for the login bypass.
 *
 * The bug: when Supabase returned an error (which is what a wrong password
 * is) or could not be reached, /login, /register and /google-callback signed
 * a "mock mode" token anyway, so any email and password got into the app.
 *
 * These drive the real routes and middleware over HTTP with Supabase stubbed,
 * and assert that no failure path hands out a token.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';
process.env.JWT_SECRET = 'test-jwt-secret';

// ---- stub Supabase: each test sets what the next auth call does ----------
let next = {};
const fakeSupabase = {
  auth: {
    async signInWithPassword() { return next.signIn(); },
    async signUp() { return next.signUp(); },
    async getUser() { return next.getUser(); },
  },
};
const supabasePath = require.resolve('@supabase/supabase-js');
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { createClient: () => fakeSupabase },
};

const authRoutes = require('../routes/auth');
const { authenticateToken } = require('../middleware/auth');

const REAL_ID = '0d7c9f3e-5b1a-4c2d-9e8f-123456789abc';
const realUser = { id: REAL_ID, email: 'real@example.com', email_confirmed_at: '2026-01-01', user_metadata: {} };
const supabaseError = (status, code, message) => ({ data: { user: null, session: null }, error: { status, code, message } });

function start() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.get('/api/protected', authenticateToken, (req, res) => res.json({ id: req.user.id }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function call(server, method, url, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.address().port,
        method,
        path: url,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const login = { email: 'nobody@example.com', password: 'wrong-password-123' };
const signup = { email: 'nobody@example.com', password: 'secret123', fullName: 'Nobody' };

async function run() {
  // The route logs every refusal; these are deliberate.
  console.error = () => {};
  const server = await start();
  const noToken = (r, label) => {
    assert.equal(r.body.token, undefined, `${label}: must not issue a token`);
    assert.notEqual(r.body.success, true, `${label}: must not report success`);
  };

  // ---- login ----------------------------------------------------------------
  next.signIn = () => supabaseError(400, 'invalid_credentials', 'Invalid login credentials');
  let r = await call(server, 'POST', '/api/auth/login', { body: login });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'Invalid email or password');
  noToken(r, 'wrong password');
  console.log('✓ a wrong password is refused with 401 and no token');

  next.signIn = () => supabaseError(400, 'email_not_confirmed', 'Email not confirmed');
  r = await call(server, 'POST', '/api/auth/login', { body: login });
  assert.equal(r.status, 403);
  noToken(r, 'unconfirmed email');
  console.log('✓ an unconfirmed email is refused with 403 and no token');

  for (const [status, label] of [[401, 'our API key rejected'], [500, 'Supabase down']]) {
    next.signIn = () => supabaseError(status, 'x', label);
    r = await call(server, 'POST', '/api/auth/login', { body: login });
    assert.equal(r.status, 503, label);
    noToken(r, label);
  }
  next.signIn = () => { throw new Error('ECONNRESET'); };
  r = await call(server, 'POST', '/api/auth/login', { body: login });
  assert.equal(r.status, 503);
  noToken(r, 'Supabase unreachable');
  console.log('✓ Supabase failures return 503, never a token');

  next.signIn = () => ({ data: { user: realUser, session: {} }, error: null });
  r = await call(server, 'POST', '/api/auth/login', { body: { email: realUser.email, password: 'right' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.id, REAL_ID);
  const goodToken = r.body.token;
  assert.equal(jwt.verify(goodToken, process.env.JWT_SECRET).userId, REAL_ID);
  console.log('✓ a correct password still logs in with a token for the real user id');

  // ---- register -------------------------------------------------------------
  next.signUp = () => supabaseError(422, 'user_already_exists', 'User already registered');
  r = await call(server, 'POST', '/api/auth/register', { body: signup });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'User already registered');
  noToken(r, 'duplicate registration');

  next.signUp = () => { throw new Error('ECONNRESET'); };
  r = await call(server, 'POST', '/api/auth/register', { body: signup });
  assert.equal(r.status, 503);
  noToken(r, 'register while Supabase unreachable');
  console.log('✓ failed registrations return an error and no token');

  // ---- Google callback ------------------------------------------------------
  next.getUser = () => { throw new Error('ECONNRESET'); };
  r = await call(server, 'POST', '/api/auth/google-callback', { body: { access_token: 'x' } });
  assert.equal(r.status, 503);
  noToken(r, 'google callback while Supabase unreachable');
  console.log('✓ the Google callback no longer invents a user when Supabase fails');

  // ---- Supabase not configured ---------------------------------------------
  const savedUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://your-project.supabase.co';
  r = await call(server, 'POST', '/api/auth/login', { body: login });
  assert.equal(r.status, 503);
  noToken(r, 'unconfigured login');
  r = await call(server, 'POST', '/api/auth/register', { body: signup });
  assert.equal(r.status, 503);
  noToken(r, 'unconfigured register');
  process.env.SUPABASE_URL = savedUrl;
  console.log('✓ an unconfigured Supabase refuses login and registration');

  // ---- tokens already issued by the old mock mode --------------------------
  const mockToken = jwt.sign({ userId: 'user_1792208310586_gqwff57mg', email: 'nobody@example.com' }, process.env.JWT_SECRET);
  next.getUser = () => ({ data: { user: null }, error: { message: 'invalid JWT' } });
  r = await call(server, 'GET', '/api/protected', { token: mockToken });
  assert.equal(r.status, 401, 'middleware must refuse mock-mode tokens');
  r = await call(server, 'GET', '/api/auth/me', { token: mockToken });
  assert.equal(r.status, 401, '/me must refuse mock-mode tokens');

  const fallbackToken = jwt.sign({ userId: REAL_ID, email: 'x@example.com' }, 'fallback_jwt_secret');
  r = await call(server, 'GET', '/api/protected', { token: fallbackToken });
  assert.equal(r.status, 401, 'tokens signed with the old hardcoded fallback secret must not verify');

  r = await call(server, 'GET', '/api/protected', { token: goodToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, REAL_ID);
  console.log('✓ mock-mode and fallback-secret tokens are refused; real tokens still work');

  server.close();
  console.log('\nAll auth tests passed.');
}

run().catch((error) => {
  console.log(error);
  process.exit(1);
});
