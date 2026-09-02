import { resolveConfig } from './config.js';

/** An error carrying the HTTP status and parsed body of a failed API call. */
export class EromifyApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'EromifyApiError';
    this.status = status;
    this.body = body;
  }
}

export class EromifyClient {
  constructor(overrides = {}) {
    const { apiUrl, token } = resolveConfig(overrides);
    this.apiUrl = apiUrl;
    this.token = token;
    this.timeoutMs = Number(process.env.EROMIFY_TIMEOUT_MS) || 120000;
  }

  get hasToken() {
    return Boolean(this.token);
  }

  /**
   * Perform a request against the Eromify backend.
   * `auth: false` skips the bearer header for public endpoints.
   */
  async request(method, endpoint, { body, query, auth = true } = {}) {
    if (auth && !this.token) {
      throw new EromifyApiError(
        'No Eromify API token configured. Run `eromify-mcp login`, or set EROMIFY_API_TOKEN.',
        { status: 401 }
      );
    }

    const url = new URL(this.apiUrl + endpoint);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = { Accept: 'application/json' };
    if (auth) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new EromifyApiError(`Request to ${method} ${endpoint} timed out after ${this.timeoutMs}ms.`);
      }
      throw new EromifyApiError(`Could not reach the Eromify API at ${this.apiUrl}: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const detail = payload?.error || payload?.message || response.statusText;
      throw new EromifyApiError(`${method} ${endpoint} failed (${response.status}): ${detail}`, {
        status: response.status,
        body: payload,
      });
    }

    return payload;
  }

  get(endpoint, options) {
    return this.request('GET', endpoint, options);
  }

  post(endpoint, body, options) {
    return this.request('POST', endpoint, { ...options, body });
  }

  put(endpoint, body, options) {
    return this.request('PUT', endpoint, { ...options, body });
  }

  delete(endpoint, options) {
    return this.request('DELETE', endpoint, options);
  }

  /** Exchange email + password for a bearer token. */
  async login(email, password) {
    const result = await this.request('POST', '/auth/login', {
      body: { email, password },
      auth: false,
    });
    const token = result?.token || result?.session?.access_token;
    if (!token) {
      throw new EromifyApiError('Login succeeded but no token was returned by the API.');
    }
    return { token, user: result?.user };
  }
}
