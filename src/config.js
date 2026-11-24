import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveDataDir() {
  if (process.env.RADARXL_DATA_DIR) {
    const custom = process.env.RADARXL_DATA_DIR;
    try {
      if (!fs.existsSync(custom)) fs.mkdirSync(custom, { recursive: true });
      return custom;
    } catch {}
  }
  const localData = path.join(rootDir, 'data');
  try {
    if (!fs.existsSync(localData)) {
      fs.mkdirSync(localData, { recursive: true });
    }
    const testFile = path.join(localData, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return localData;
  } catch {
    const appData = process.env.APPDATA || process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const userRadarDir = path.join(appData, 'RadarXL');
    try {
      if (!fs.existsSync(userRadarDir)) {
        fs.mkdirSync(userRadarDir, { recursive: true });
      }
    } catch {}
    return userRadarDir;
  }
}

const dataDir = resolveDataDir();

function numberFromEnv(name, fallback, min = 0) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

export const config = {
  rootDir,
  host: process.env.HOST || '127.0.0.1',
  port: numberFromEnv('PORT', 3000, 1),
  logLevel: process.env.LOG_LEVEL || 'info',
  dataDir,
  screenshotDir: path.join(dataDir, 'screenshots'),
  leadsFile: path.join(dataDir, 'leads.json'),
  archivesFile: path.join(dataDir, 'archives.json'),
  logFile: path.join(dataDir, 'app.log'),
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  googleSearchApiKey: process.env.GOOGLE_SEARCH_API_KEY || '',
  googleSearchCx: process.env.GOOGLE_SEARCH_CX || '',
  discoveryProvider: (process.env.DISCOVERY_PROVIDER || 'auto').toLowerCase(),
  osmContactEmail: process.env.OSM_CONTACT_EMAIL || '',
  overpassEndpoints: (process.env.OVERPASS_ENDPOINTS || 'https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter')
    .split(',').map((value) => value.trim()).filter(Boolean),
  instagramSessionId: process.env.INSTAGRAM_SESSION_ID || '',
  aiApiKey: process.env.AI_API_KEY || '',
  aiBaseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  aiModel: process.env.AI_MODEL || 'gpt-4.1-mini',
  ollamaEnabled: String(process.env.OLLAMA_ENABLED || 'true').toLowerCase() !== 'false',
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  ollamaTimeoutMs: numberFromEnv('OLLAMA_TIMEOUT_MS', 60_000, 1_000),
  discoveryDelayMs: numberFromEnv('DISCOVERY_DELAY_MS', 500),
  websiteDelayMs: numberFromEnv('WEBSITE_DELAY_MS', 800),
  instagramDelayMs: numberFromEnv('INSTAGRAM_DELAY_MS', 1500),
  auditConcurrency: numberFromEnv('AUDIT_CONCURRENCY', 1, 1),
  requestTimeoutMs: numberFromEnv('REQUEST_TIMEOUT_MS', 20000, 1000),
  maxRetries: numberFromEnv('MAX_RETRIES', 2),
  maxLeadsPerSearch: numberFromEnv('MAX_LEADS_PER_SEARCH', 20, 1),
  candidateMultiplier: numberFromEnv('CANDIDATE_MULTIPLIER', 8, 1),
  websitePrecheckTimeoutMs: numberFromEnv('WEBSITE_PRECHECK_TIMEOUT_MS', 8_000, 1_000),
  skipUnreachableWebsites: String(process.env.SKIP_UNREACHABLE_WEBSITES || 'true').toLowerCase() !== 'false',
  auditMode: (process.env.AUDIT_MODE || 'economico').toLowerCase(),
  lighthouseEnabled: String(process.env.LIGHTHOUSE_ENABLED || 'false').toLowerCase() === 'true',
  screenshotEnabled: String(process.env.SCREENSHOT_ENABLED || 'false').toLowerCase() === 'true',
  demoMode: String(process.env.DEMO_MODE).toLowerCase() === 'true'
};

export function publicConfig() {
  return {
    appName: 'RadarXL Intelligence',
    version: '2.0.0',
    googleMapsConfigured: Boolean(config.googleMapsApiKey),
    googleSearchConfigured: Boolean(config.googleSearchApiKey && config.googleSearchCx),
    freeDiscoveryConfigured: true,
    discoveryProvider: config.discoveryProvider === 'auto'
      ? (config.googleMapsApiKey ? 'Google Maps' : 'OpenStreetMap')
      : config.discoveryProvider,
    aiConfigured: Boolean(config.aiApiKey),
    ollamaEnabled: config.ollamaEnabled,
    localMessageFallback: true,
    skipUnreachableWebsites: config.skipUnreachableWebsites,
    auditMode: config.auditMode,
    lighthouseEnabled: config.lighthouseEnabled,
    screenshotEnabled: config.screenshotEnabled,
    instagramSessionConfigured: Boolean(config.instagramSessionId),
    demoMode: config.demoMode,
    maxLeadsPerSearch: config.maxLeadsPerSearch
  };
}
