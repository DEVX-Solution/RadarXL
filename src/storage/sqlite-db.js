import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let dbInstance = null;

export function getDatabasePath() {
  const dbPath = process.env.SQLITE_DB_PATH || path.join(config.dataDir, 'radarxl.db');
  return dbPath;
}

export function initDatabase(dbPath = getDatabasePath(), forceNew = false) {
  if (dbInstance && !forceNew && dbPath !== ':memory:') return dbInstance;

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);
  
  // Pragmas para performance e integridade transacional
  if (dbPath !== ':memory:') {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
  }

  // Tabelas
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_leads (
      id TEXT PRIMARY KEY,
      empresa TEXT NOT NULL,
      categoria TEXT,
      cidade TEXT,
      estado TEXT,
      site TEXT,
      instagram TEXT,
      instagram_url TEXT,
      email TEXT,
      telefone TEXT,
      status TEXT DEFAULT 'descoberto',
      score INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      fonte TEXT,
      google_place_id TEXT,
      osm_id TEXT,
      maps_url TEXT,
      screenshot_path TEXT,
      auditoria_json TEXT,
      website_data_json TEXT,
      instagram_details_json TEXT,
      problemas_json TEXT,
      analise_ia TEXT,
      mensagem_personalizada TEXT,
      canal_recomendado TEXT,
      ai_provider TEXT,
      processing_error TEXT,
      restored_from_archive TEXT,
      raw_data_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leads_favorite ON local_leads(favorite);
    CREATE INDEX IF NOT EXISTS idx_leads_score ON local_leads(score);
    CREATE INDEX IF NOT EXISTS idx_leads_city ON local_leads(cidade);
    CREATE INDEX IF NOT EXISTS idx_leads_category ON local_leads(categoria);
    CREATE INDEX IF NOT EXISTS idx_leads_place_id ON local_leads(google_place_id);
    CREATE INDEX IF NOT EXISTS idx_leads_osm_id ON local_leads(osm_id);

    CREATE TABLE IF NOT EXISTS local_searches (
      id TEXT PRIMARY KEY,
      categoria TEXT NOT NULL,
      cidade TEXT NOT NULL,
      estado TEXT,
      limite INTEGER DEFAULT 10,
      status TEXT DEFAULT 'executando',
      progress_percent INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      desired_count INTEGER DEFAULT 0,
      scanned_count INTEGER DEFAULT 0,
      discarded_count INTEGER DEFAULT 0,
      repeated_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_by_name TEXT,
      created_by_id TEXT,
      team_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_search_leads (
      search_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (search_id, lead_id),
      FOREIGN KEY (lead_id) REFERENCES local_leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS local_archives (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      count INTEGER NOT NULL,
      leads_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  if (dbPath !== ':memory:') {
    dbInstance = db;
    logger.info(`Banco de dados SQLite inicializado em: ${dbPath}`);
  }
  
  return db;
}

export function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }
}

export function getAppMeta(db, key, fallback = null) {
  try {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  } catch {
    return fallback;
  }
}

export function setAppMeta(db, key, value) {
  try {
    const serialized = JSON.stringify(value);
    db.prepare(`
      INSERT INTO app_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, serialized);
    return true;
  } catch (err) {
    logger.warn('Erro ao salvar meta no SQLite:', { error: err.message });
    return false;
  }
}

export function getAllAppMeta(db) {
  try {
    const rows = db.prepare('SELECT key, value FROM app_meta').all();
    const result = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result;
  } catch {
    return {};
  }
}
