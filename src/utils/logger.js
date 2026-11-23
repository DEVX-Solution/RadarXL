import fs from 'node:fs';
import { config } from '../config.js';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };

function serializeError(error) {
  if (!(error instanceof Error)) return error;
  return { name: error.name, message: error.message, stack: error.stack };
}

function write(level, message, context = {}) {
  try {
    if ((levels[level] || 20) < (levels[config.logLevel] || 20)) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...Object.fromEntries(
        Object.entries(context).map(([key, value]) => [key, serializeError(value)])
      )
    };
    const line = `${JSON.stringify(entry)}\n`;
    try {
      const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      consoleMethod(`[${level.toUpperCase()}] ${message}`, context.error?.message || '');
    } catch {
      // Ignore console EPIPE or write errors
    }
    try {
      fs.appendFileSync(config.logFile, line, 'utf8');
    } catch {
      // Logging must never interrupt lead processing.
    }
  } catch {
    // Avoid crashing or looping during logging
  }
}

export const logger = {
  debug: (message, context) => write('debug', message, context),
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context)
};
