import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { logger } from '../utils/logger.js';

let browserInstance = null;
let browserPromise = null;
let pagesCreatedSinceLaunch = 0;
const MAX_PAGES_BEFORE_RECYCLE = 20;

export function findBrowserExecutable() {
  const candidates = [];

  try {
    const defaultPath = puppeteer.executablePath();
    if (defaultPath && existsSync(defaultPath)) candidates.push(defaultPath);
  } catch {}

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    const programFiles = process.env.PROGRAMFILES;
    const programFilesX86 = process.env['PROGRAMFILES(X86)'];
    if (local) candidates.push(
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
    if (programFiles) candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
    if (programFilesX86) candidates.push(
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }

  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}

export async function getBrowser() {
  // Reciclagem de navegador para evitar vazamento acumulado de memória
  if (browserInstance && pagesCreatedSinceLaunch >= MAX_PAGES_BEFORE_RECYCLE) {
    logger.info(`Reciclando Chromium após ${pagesCreatedSinceLaunch} auditorias para liberar memória...`);
    await closeBrowser();
  }

  if (browserInstance && browserInstance.isConnected()) {
    pagesCreatedSinceLaunch += 1;
    return browserInstance;
  }

  if (!browserPromise) {
    const executablePath = findBrowserExecutable();
    browserPromise = puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--remote-debugging-port=0',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--js-flags=--max-old-space-size=256'
      ]
    }).then((browser) => {
      browserInstance = browser;
      pagesCreatedSinceLaunch = 1;
      browser.once('disconnected', () => {
        browserInstance = null;
        browserPromise = null;
        pagesCreatedSinceLaunch = 0;
      });
      return browser;
    }).catch((error) => {
      browserInstance = null;
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

export function isBrowserRunning() {
  return Boolean(browserInstance && browserInstance.isConnected());
}

export function getBrowserMetrics() {
  return {
    running: isBrowserRunning(),
    pagesProcessed: pagesCreatedSinceLaunch,
    pid: browserInstance?.process()?.pid || null
  };
}

export async function closeBrowser() {
  if (!browserInstance && !browserPromise) return;
  const target = browserInstance || (await browserPromise.catch(() => null));
  browserInstance = null;
  browserPromise = null;
  pagesCreatedSinceLaunch = 0;

  if (!target) return;

  try {
    const closePromise = target.close();
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
    await Promise.race([closePromise, timeoutPromise]);
    // Se o processo ainda estiver ativo após timeout, força o encerramento do processo
    const proc = target.process();
    if (proc && !proc.killed) {
      proc.kill('SIGKILL');
    }
  } catch (error) {
    logger.warn('Falha controlada ao encerrar o navegador', { error: error.message });
  }
}
