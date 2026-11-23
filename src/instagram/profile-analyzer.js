import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { fetchWithTimeout } from '../utils/http.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { cleanText, clamp } from '../utils/text.js';

const limiter = new RateLimiter({ minTime: config.instagramDelayMs, concurrency: 1 });

function parseCompactNumber(value = '') {
  const normalized = value.toLowerCase().replace(/\s/g, '').replace(',', '.');
  const number = Number.parseFloat(normalized.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(number)) return null;
  if (/mil|k/.test(normalized)) return Math.round(number * 1_000);
  if (/mi|m/.test(normalized)) return Math.round(number * 1_000_000);
  return Math.round(number);
}

function parseFollowers(description) {
  const patterns = [
    /([\d.,]+\s*(?:mil|mi|[km])?)\s+(?:seguidores|followers)/i,
    /"edge_followed_by":\s*\{"count":\s*(\d+)/i,
    /"follower_count":\s*(\d+)/i
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return parseCompactNumber(match[1]);
  }
  return null;
}

function extractLatestPostDate(html) {
  const timestamps = [...html.matchAll(/"taken_at_timestamp":\s*(\d{10})/g)]
    .map((match) => Number(match[1]) * 1000)
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

function activityFromDate(date) {
  if (!date) return 'desconhecida';
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (days <= 30) return 'ativo';
  if (days <= 90) return 'pouco ativo';
  return 'inativo';
}

function buildSummary(details) {
  if (!details.found) return 'Perfil do Instagram não localizado ou indisponível para análise pública.';
  const observations = [];
  observations.push(details.bioClarity === 'boa' ? 'A bio comunica bem a proposta do negócio' : 'A bio pode comunicar melhor a proposta e o diferencial');
  observations.push(details.hasLink ? 'há um link de conversão no perfil' : 'não foi identificado link externo no perfil');
  if (details.activity !== 'desconhecida') observations.push(`o perfil parece ${details.activity}`);
  if (details.followers !== null) observations.push(`foram identificados aproximadamente ${details.followers.toLocaleString('pt-BR')} seguidores`);
  return `${observations.join('; ')}.`;
}

export async function analyzeInstagram(profileUrl) {
  if (!profileUrl) {
    return {
      found: false,
      followers: null,
      activity: 'ausente',
      weak: true,
      qualityScore: 0,
      summary: 'A empresa não possui um perfil oficial do Instagram localizado.'
    };
  }

  return limiter.schedule(async () => {
    try {
      const response = await fetchWithTimeout(profileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
          ...(config.instagramSessionId ? { Cookie: `sessionid=${config.instagramSessionId}` } : {})
        },
        retries: 1
      });
      const html = (await response.text()).slice(0, 5_000_000);
      const $ = cheerio.load(html);
      const description = cleanText(
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') || ''
      );
      const title = cleanText($('meta[property="og:title"]').attr('content') || $('title').text());
      const imageUrl = $('meta[property="og:image"]').attr('content') || '';
      const followers = parseFollowers(`${description} ${html}`);
      const latestPostDate = extractLatestPostDate(html);
      const activity = activityFromDate(latestPostDate);
      const bioText = description.replace(/^[^:]+:\s*/, '').slice(0, 300);
      const hasLink = /"external_url":\s*"https?:|linktr\.ee|wa\.me|bio\.site|beacons\.ai/i.test(html);
      const hasBusinessWords = /agend|orçamento|atendimento|especialista|serviço|produto|delivery|contato/i.test(bioText);
      const bioClarity = bioText.length >= 35 && hasBusinessWords ? 'boa' : bioText.length >= 15 ? 'regular' : 'fraca';
      const found = Boolean(description || title) && !/login|entrar • instagram/i.test(title);
      let qualityScore = found ? 25 : 0;
      qualityScore += bioClarity === 'boa' ? 25 : bioClarity === 'regular' ? 12 : 0;
      qualityScore += hasLink ? 20 : 0;
      qualityScore += imageUrl ? 10 : 0;
      qualityScore += activity === 'ativo' ? 20 : activity === 'pouco ativo' ? 10 : activity === 'desconhecida' ? 5 : 0;

      const details = {
        found,
        followers,
        activity,
        latestPostDate: latestPostDate?.toISOString() || null,
        bioClarity,
        hasLink,
        hasProfilePhoto: Boolean(imageUrl),
        profilePhotoUrl: imageUrl,
        qualityScore: clamp(qualityScore, 0, 100),
        weak: !found || qualityScore < 50,
        dataLimited: activity === 'desconhecida'
      };
      details.summary = buildSummary(details);
      return details;
    } catch (error) {
      return {
        found: false,
        followers: null,
        activity: 'desconhecida',
        weak: true,
        qualityScore: 0,
        dataLimited: true,
        error: error.message,
        summary: 'O perfil foi localizado, mas o Instagram limitou a leitura dos dados públicos nesta execução.'
      };
    }
  });
}
