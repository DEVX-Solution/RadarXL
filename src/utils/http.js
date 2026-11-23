import { config } from '../config.js';
import { withRetry } from './retry.js';

export class HttpError extends Error {
  constructor(message, status, body = '') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = options.timeoutMs || config.requestTimeoutMs;
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new HttpError(`HTTP ${response.status} ao acessar ${url}`, response.status, body.slice(0, 500));
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }, {
    retries: options.retries ?? config.maxRetries,
    shouldRetry: (error) => error.name === 'AbortError' || error.status === 429 || error.status >= 500
  });
}

export async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  return response.json();
}
