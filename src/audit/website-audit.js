import path from 'node:path';
import { config } from '../config.js';
import { getBrowser } from './browser.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { clamp, slugify } from '../utils/text.js';
import { logger } from '../utils/logger.js';

const auditLimiter = new RateLimiter({ minTime: 300, concurrency: config.auditConcurrency });

function score(category) {
  const value = category?.score;
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function fallbackScores(technical, websiteData) {
  const loadTimeMs = Number(technical.loadTimeMs) > 0 ? Number(technical.loadTimeMs) : 2500;
  const performance = clamp(Math.round(100 - loadTimeMs / 55), 5, 95);
  let seo = 100;
  if (!websiteData?.title) seo -= 25;
  if (!websiteData?.description) seo -= 25;
  if (!websiteData?.headings) seo -= 15;
  if (!websiteData?.hasViewport) seo -= 15;
  if (!websiteData?.hasSchema) seo -= 10;
  let accessibility = 90;
  accessibility -= Math.min(40, (websiteData?.imagesMissingAlt || 0) * 4);
  if (!websiteData?.hasViewport) accessibility -= 20;
  return {
    performance,
    seo: clamp(seo, 0, 100),
    acessibilidade: clamp(accessibility, 0, 100)
  };
}

function hasHttps(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createFallbackAudit(lead, websiteData = {}, error = null) {
  const finalUrl = websiteData.finalUrl || lead.site || '';
  const loadTimeMs = Number(websiteData.responseTimeMs) > 0
    ? Number(websiteData.responseTimeMs)
    : 2500;
  const scores = fallbackScores({ loadTimeMs }, websiteData);

  return {
    ...scores,
    ssl: hasHttps(finalUrl),
    mobile_friendly: Boolean(websiteData.hasViewport),
    load_time_ms: loadTimeMs,
    broken_layout: false,
    http_status: Number(websiteData.httpStatus) || 0,
    screenshot_path: '',
    estimated: true,
    audit_mode: 'economico',
    audit_source: 'technical_fallback',
    warning: error?.message
      ? `Auditoria no modo econômico ou navegador indisponível (${error.message}). Notas estimadas.`
      : 'Auditoria técnica no modo econômico (baixo consumo).'
  };
}

async function runLighthouse(url, browser) {
  const port = Number(new URL(browser.wsEndpoint()).port);
  const { default: lighthouse } = await import('lighthouse');
  const result = await lighthouse(url, {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'seo', 'accessibility'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: 'simulate'
  });
  return {
    performance: score(result?.lhr?.categories?.performance),
    seo: score(result?.lhr?.categories?.seo),
    acessibilidade: score(result?.lhr?.categories?.accessibility)
  };
}

async function runLighthouseWithTimeout(url, browser, timeoutMs = 25_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Auditoria do Lighthouse expirou por tempo limite (timeout).'));
    }, timeoutMs);

    runLighthouse(url, browser)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Executa auditoria no website de acordo com o modo selecionado:
 * - 'economico' (padrão): Fetch + Cheerio, zero Puppeteer, ultrarrápido
 * - 'completo': Puppeteer para testes reais de layout e responsividade
 * - 'profissional': Puppeteer + Lighthouse + Screenshot sob demanda
 */
export async function auditWebsite(lead, websiteData = {}, options = {}) {
  const auditMode = options.auditMode || (
    options.lighthouseEnabled ? 'profissional' :
    (options.screenshotEnabled ? 'completo' : config.auditMode)
  );

  if (!lead.site || !websiteData.reachable) {
    return {
      performance: 0,
      seo: 0,
      acessibilidade: 0,
      ssl: false,
      mobile_friendly: false,
      load_time_ms: 0,
      broken_layout: false,
      audit_mode: auditMode,
      error: websiteData.error || 'Empresa sem site público localizado.'
    };
  }

  // MODO ECONÔMICO: Nenhum Puppeteer, sem screenshot, sem Lighthouse
  if (auditMode === 'economico' && !options.lighthouseEnabled && !options.screenshotEnabled) {
    return createFallbackAudit(lead, websiteData);
  }

  // MODO COMPLETO ou MODO PROFISSIONAL
  return auditLimiter.schedule(async () => {
    const finalUrl = websiteData.finalUrl || lead.site;
    const screenshotName = `${slugify(lead.empresa) || 'lead'}-${Date.now()}.png`;
    const screenshotFile = path.join(config.screenshotDir, screenshotName);
    let page;
    let technical;

    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
      
      const startedAt = Date.now();
      const response = await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      const loadTimeMs = Date.now() - startedAt;

      technical = await page.evaluate(() => {
        const root = document.documentElement;
        const overflowing = [...document.querySelectorAll('body *')].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > window.innerWidth + 8 || rect.right > window.innerWidth + 8 || rect.left < -8;
        }).length;
        const invisibleMainContent = document.body.innerText.trim().length < 80;
        return {
          horizontalOverflow: root.scrollWidth > window.innerWidth + 8,
          overflowingElements: overflowing,
          invisibleMainContent,
          viewportMeta: Boolean(document.querySelector('meta[name="viewport"]'))
        };
      }).catch(() => ({
        horizontalOverflow: false,
        overflowingElements: 0,
        invisibleMainContent: false,
        viewportMeta: true
      }));

      technical.loadTimeMs = loadTimeMs;
      technical.httpStatus = response?.status() || 0;

      let hasScreenshot = false;
      const shouldScreenshot = auditMode === 'profissional' || options.screenshotEnabled === true;
      if (shouldScreenshot) {
        await page.setViewport({ width: 1365, height: 768, deviceScaleFactor: 1, isMobile: false });
        await page.screenshot({ path: screenshotFile, fullPage: false, type: 'png' });
        hasScreenshot = true;
      }

      let lighthouseScores;
      const shouldLighthouse = auditMode === 'profissional' || options.lighthouseEnabled === true;
      if (shouldLighthouse) {
        try {
          lighthouseScores = await runLighthouseWithTimeout(finalUrl, browser, 20_000);
        } catch (error) {
          logger.warn('Lighthouse expirou ou falhou; usando notas técnicas estimadas', { lead: lead.empresa, error: error.message });
          lighthouseScores = fallbackScores(technical, websiteData);
        }
      } else {
        lighthouseScores = fallbackScores(technical, websiteData);
      }

      const brokenLayout = technical.invisibleMainContent || technical.overflowingElements > 4;
      return {
        ...lighthouseScores,
        ssl: new URL(finalUrl).protocol === 'https:',
        mobile_friendly: technical.viewportMeta && !technical.horizontalOverflow && !brokenLayout,
        load_time_ms: technical.loadTimeMs,
        broken_layout: brokenLayout,
        http_status: technical.httpStatus,
        screenshot_path: hasScreenshot ? `/screenshots/${screenshotName}` : '',
        estimated: !shouldLighthouse,
        audit_mode: auditMode,
        audit_source: shouldLighthouse ? 'lighthouse' : 'puppeteer_technical'
      };
    } catch (error) {
      logger.warn('Puppeteer falhou na auditoria; usando notas técnicas de fallback', {
        lead: lead.empresa,
        error: error.message
      });
      return createFallbackAudit(lead, websiteData, error);
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  });
}
