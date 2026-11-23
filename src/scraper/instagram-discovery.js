import { config } from '../config.js';
import { fetchJson } from '../utils/http.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { normalizeInstagram } from '../utils/text.js';

const limiter = new RateLimiter({ minTime: config.discoveryDelayMs, concurrency: 1 });

const excludedHandles = new Set([
  'explore', 'accounts', 'about', 'developer', 'reel', 'reels', 'stories', 'direct'
]);

export async function discoverInstagramProfile(lead) {
  const fromWebsite = normalizeInstagram(lead.websiteData?.instagramUrl || lead.instagram_url || lead.instagram);
  if (fromWebsite.handle) return fromWebsite;

  if (!config.googleSearchApiKey || !config.googleSearchCx) return { handle: '', url: '' };
  const terms = [lead.empresa, lead.cidade, lead.estado, 'Instagram'].filter(Boolean).join(' ');
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', config.googleSearchApiKey);
  url.searchParams.set('cx', config.googleSearchCx);
  url.searchParams.set('q', `site:instagram.com ${terms}`);
  url.searchParams.set('num', '5');
  url.searchParams.set('gl', 'br');
  url.searchParams.set('hl', 'pt-BR');

  const data = await limiter.schedule(() => fetchJson(url));
  for (const item of data.items || []) {
    const profile = normalizeInstagram(item.link);
    const rawHandle = profile.handle.slice(1);
    if (profile.handle && !excludedHandles.has(rawHandle) && !item.link.includes('/p/')) return profile;
  }
  return { handle: '', url: '' };
}
