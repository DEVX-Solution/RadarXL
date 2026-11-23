import { initDatabase } from './sqlite-db.js';
import { createId } from '../utils/text.js';
import { hasDigitalPresence } from '../utils/lead-eligibility.js';
import { logger } from '../utils/logger.js';

function rowToLead(row) {
  if (!row) return null;
  let auditoria = {};
  let websiteData = {};
  let instagramDetails = {};
  let problemas = [];
  let rawData = {};

  try { auditoria = JSON.parse(row.auditoria_json || '{}'); } catch {}
  try { websiteData = JSON.parse(row.website_data_json || '{}'); } catch {}
  try { instagramDetails = JSON.parse(row.instagram_details_json || '{}'); } catch {}
  try { problemas = JSON.parse(row.problemas_json || '[]'); } catch {}
  try { rawData = JSON.parse(row.raw_data_json || '{}'); } catch {}

  return {
    ...rawData,
    id: row.id,
    empresa: row.empresa,
    categoria: row.categoria || '',
    cidade: row.cidade || '',
    estado: row.estado || '',
    site: row.site || '',
    instagram: row.instagram || '',
    instagram_url: row.instagram_url || '',
    contato: {
      email: row.email || '',
      telefone: row.telefone || ''
    },
    status: row.status || 'descoberto',
    score: Number(row.score || 0),
    favorite: Boolean(row.favorite),
    fonte: row.fonte || '',
    googlePlaceId: row.google_place_id || undefined,
    osmId: row.osm_id || undefined,
    maps_url: row.maps_url || '',
    screenshot_path: row.screenshot_path || '',
    auditoria,
    websiteData,
    instagramDetails,
    problemas,
    analise_ia: row.analise_ia || '',
    mensagem_personalizada: row.mensagem_personalizada || '',
    canal_recomendado: row.canal_recomendado || '',
    ai_provider: row.ai_provider || '',
    processingError: row.processing_error || '',
    restoredFromArchive: row.restored_from_archive || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class LeadStore {
  constructor(db = null) {
    this.db = db;
  }

  async init() {
    if (!this.db) {
      this.db = initDatabase();
    }
    return this;
  }

  list({ minScore = 0, search = '' } = {}) {
    const query = search.toLocaleLowerCase('pt-BR').trim();
    let sql = `SELECT * FROM local_leads WHERE 1=1`;
    const params = {};

    if (minScore > 0) {
      sql += ` AND score >= @minScore`;
      params.minScore = Number(minScore);
    }

    if (query) {
      sql += ` AND (
        LOWER(empresa) LIKE @query OR
        LOWER(categoria) LIKE @query OR
        LOWER(cidade) LIKE @query OR
        LOWER(instagram) LIKE @query
      )`;
      params.query = `%${query}%`;
    }

    sql += ` ORDER BY favorite DESC, score DESC, updated_at DESC`;

    const rows = this.db.prepare(sql).all(params);
    return rows.map(rowToLead).filter(hasDigitalPresence);
  }

  get(id) {
    const row = this.db.prepare(`SELECT * FROM local_leads WHERE id = ?`).get(String(id));
    return rowToLead(row);
  }

  all() {
    const rows = this.db.prepare(`SELECT * FROM local_leads ORDER BY updated_at DESC`).all();
    return rows.map(rowToLead);
  }

  async upsert(lead) {
    const now = new Date().toISOString();
    const id = lead.id || createId();
    const createdAt = lead.createdAt || now;
    const updatedAt = now;

    // Verificar duplicação por Google Place ID ou OSM ID se não tiver ID correspondente
    let existingId = id;
    if (!lead.id) {
      if (lead.googlePlaceId) {
        const found = this.db.prepare(`SELECT id FROM local_leads WHERE google_place_id = ?`).get(String(lead.googlePlaceId));
        if (found) existingId = found.id;
      } else if (lead.osmId) {
        const found = this.db.prepare(`SELECT id FROM local_leads WHERE osm_id = ?`).get(String(lead.osmId));
        if (found) existingId = found.id;
      }
    }

    const email = lead.contato?.email || lead.email || '';
    const telefone = lead.contato?.telefone || lead.telefone || '';

    const stmt = this.db.prepare(`
      INSERT INTO local_leads (
        id, empresa, categoria, cidade, estado, site, instagram, instagram_url,
        email, telefone, status, score, favorite, fonte, google_place_id, osm_id,
        maps_url, screenshot_path, auditoria_json, website_data_json,
        instagram_details_json, problemas_json, analise_ia, mensagem_personalizada,
        canal_recomendado, ai_provider, processing_error, restored_from_archive,
        raw_data_json, created_at, updated_at
      ) VALUES (
        @id, @empresa, @categoria, @cidade, @estado, @site, @instagram, @instagram_url,
        @email, @telefone, @status, @score, @favorite, @fonte, @google_place_id, @osm_id,
        @maps_url, @screenshot_path, @auditoria_json, @website_data_json,
        @instagram_details_json, @problemas_json, @analise_ia, @mensagem_personalizada,
        @canal_recomendado, @ai_provider, @processing_error, @restored_from_archive,
        @raw_data_json, @created_at, @updated_at
      ) ON CONFLICT(id) DO UPDATE SET
        empresa = excluded.empresa,
        categoria = excluded.categoria,
        cidade = excluded.cidade,
        estado = excluded.estado,
        site = excluded.site,
        instagram = excluded.instagram,
        instagram_url = excluded.instagram_url,
        email = excluded.email,
        telefone = excluded.telefone,
        status = excluded.status,
        score = excluded.score,
        favorite = excluded.favorite,
        maps_url = excluded.maps_url,
        screenshot_path = excluded.screenshot_path,
        auditoria_json = excluded.auditoria_json,
        website_data_json = excluded.website_data_json,
        instagram_details_json = excluded.instagram_details_json,
        problemas_json = excluded.problemas_json,
        analise_ia = excluded.analise_ia,
        mensagem_personalizada = excluded.mensagem_personalizada,
        canal_recomendado = excluded.canal_recomendado,
        ai_provider = excluded.ai_provider,
        processing_error = excluded.processing_error,
        restored_from_archive = excluded.restored_from_archive,
        raw_data_json = excluded.raw_data_json,
        updated_at = excluded.updated_at;
    `);

    stmt.run({
      id: existingId,
      empresa: String(lead.empresa || ''),
      categoria: String(lead.categoria || ''),
      cidade: String(lead.cidade || ''),
      estado: String(lead.estado || ''),
      site: String(lead.site || ''),
      instagram: String(lead.instagram || ''),
      instagram_url: String(lead.instagram_url || ''),
      email,
      telefone,
      status: String(lead.status || 'descoberto'),
      score: Number(lead.score || 0),
      favorite: lead.favorite ? 1 : 0,
      fonte: String(lead.fonte || ''),
      google_place_id: lead.googlePlaceId ? String(lead.googlePlaceId) : null,
      osm_id: lead.osmId ? String(lead.osmId) : null,
      maps_url: lead.maps_url || lead.google_maps_url || '',
      screenshot_path: String(lead.screenshot_path || ''),
      auditoria_json: JSON.stringify(lead.auditoria || {}),
      website_data_json: JSON.stringify(lead.websiteData || {}),
      instagram_details_json: JSON.stringify(lead.instagramDetails || {}),
      problemas_json: JSON.stringify(lead.problemas || []),
      analise_ia: String(lead.analise_ia || ''),
      mensagem_personalizada: String(lead.mensagem_personalizada || ''),
      canal_recomendado: String(lead.canal_recomendado || ''),
      ai_provider: String(lead.ai_provider || ''),
      processing_error: String(lead.processingError || ''),
      restored_from_archive: lead.restoredFromArchive ? String(lead.restoredFromArchive) : null,
      raw_data_json: JSON.stringify(lead),
      created_at: createdAt,
      updated_at: updatedAt
    });

    // Enfileirar na fila de sincronização para o Supabase
    try {
      this.db.prepare(`
        INSERT INTO sync_queue (entity_type, entity_id, operation, payload_json, status, created_at, updated_at)
        VALUES ('lead', ?, 'UPSERT', ?, 'pending', ?, ?)
      `).run(existingId, JSON.stringify(lead), now, now);
    } catch {}

    return this.get(existingId);
  }

  async remove(id) {
    const res = this.db.prepare(`DELETE FROM local_leads WHERE id = ?`).run(String(id));
    if (res.changes > 0) {
      try {
        const now = new Date().toISOString();
        this.db.prepare(`
          INSERT INTO sync_queue (entity_type, entity_id, operation, payload_json, status, created_at, updated_at)
          VALUES ('lead', ?, 'DELETE', '{}', 'pending', ?, ?)
        `).run(String(id), now, now);
      } catch {}
      return true;
    }
    return false;
  }

  async setFavorite(id, favorite) {
    const now = new Date().toISOString();
    const favValue = favorite ? 1 : 0;
    const res = this.db.prepare(`
      UPDATE local_leads SET favorite = ?, updated_at = ? WHERE id = ?
    `).run(favValue, now, String(id));

    if (res.changes > 0) {
      try {
        this.db.prepare(`
          INSERT INTO sync_queue (entity_type, entity_id, operation, payload_json, status, created_at, updated_at)
          VALUES ('favorite', ?, 'UPDATE', ?, 'pending', ?, ?)
        `).run(String(id), JSON.stringify({ favorite: Boolean(favorite) }), now, now);
      } catch {}
      return this.get(id);
    }
    return null;
  }

  async clear() {
    this.db.prepare(`DELETE FROM local_leads`).run();
  }
}
