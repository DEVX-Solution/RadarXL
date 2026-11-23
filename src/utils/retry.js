export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(operation, options = {}) {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries || options.shouldRetry?.(error) === false) break;
      const jitter = Math.round(Math.random() * 200);
      await sleep(baseDelayMs * 2 ** attempt + jitter);
    }
  }

  throw lastError;
}
