import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { fetchWithTimeout } from '../utils/http.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { cleanText, normalizeInstagram, normalizePhone } from '../utils/text.js';

const limiter = new RateLimiter({ minTime: config.websiteDelayMs, concurrency: 2 });
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 LeadRadarBR/1.0';

export function normalizeWebsiteUrl(value) {
  if (!value) return '';
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function firstMatch(values, matcher) {
  for (const value of values) {
    const match = value.match(matcher);
    if (match) return match[0];
  }
  return '';
}

function detectOldSite($, html) {
  let points = 0;
  if ($('meta[name="viewport"]').length === 0) points += 2;
  if ($('table[width], center, marquee, font').length > 2) points += 2;
  if (/flash|swfobject|microsoft frontpage/i.test(html)) points += 3;
  if ($('script[src*="jquery-1."], script[src*="jquery-2.0"]').length) points += 1;
  const copyrightYears = cleanText($('body').text()).match(/(?:©|copyright)?\s*(19|20)\d{2}/gi) || [];
  const latestYear = Math.max(0, ...copyrightYears.map((year) => Number(year.match(/\d{4}/)?.[0])));
  if (latestYear > 0 && latestYear < new Date().getFullYear() - 3) points += 2;
  return { outdated: points >= 3, oldSiteSignals: points, latestCopyrightYear: latestYear || null };
}

export async function inspectWebsite(website, options = {}) {
  const url = normalizeWebsiteUrl(website);
  if (!url) return { reachable: false, error: 'Site não informado ou URL inválida.' };

  return limiter.schedule(async () => {
    const startedAt = Date.now();
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      timeoutMs: options.timeoutMs,
      retries: options.retries
    });
    const finalUrl = response.url;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return { reachable: false, finalUrl, error: 'O endereço não retornou uma página HTML.' };
    }
    const html = (await response.text()).slice(0, 3_000_000);
    const responseTimeMs = Date.now() - startedAt;
    const $ = cheerio.load(html);
    const links = $('a[href]').map((_, element) => $(element).attr('href')).get().filter(Boolean);
    const text = cleanText($('body').text()).slice(0, 300_000);
    const email = firstMatch(
      [...links.filter((link) => link.startsWith('mailto:')).map((link) => link.slice(7)), text],
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );
    const phoneCandidate = firstMatch(
      [...links.filter((link) => /^(?:tel:|https?:\/\/(?:wa\.me|api\.whatsapp\.com))/i.test(link)), text],
      /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/
    );
    const instagramLink = links.find((link) => /instagram\.com\/[A-Za-z0-9._]+/i.test(link)) || '';
    const instagram = normalizeInstagram(instagramLink);
    const hasViewport = $('meta[name="viewport"]').length > 0;
    const title = cleanText($('title').first().text());
    const description = cleanText($('meta[name="description"]').attr('content'));
    const headings = $('h1').length;
    const imagesMissingAlt = $('img').filter((_, image) => !cleanText($(image).attr('alt'))).length;
    const forms = $('form').length;
    const ctaCount = $('a,button').filter((_, element) => /contato|agend|orçamento|whatsapp|fale|saiba mais/i.test($(element).text())).length;

    return {
      reachable: true,
      finalUrl,
      httpStatus: response.status,
      responseTimeMs,
      htmlSizeBytes: Buffer.byteLength(html),
      title,
      description,
      email,
      phone: normalizePhone(phoneCandidate),
      instagramUrl: instagram.url,
      instagramHandle: instagram.handle,
      hasViewport,
      headings,
      imagesMissingAlt,
      forms,
      ctaCount,
      hasAnalytics: /googletagmanager|google-analytics|gtag\(/i.test(html),
      hasSchema: $('script[type="application/ld+json"]').length > 0,
      ...detectOldSite($, html)
    };
  });
}
