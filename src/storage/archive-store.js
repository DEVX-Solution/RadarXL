import { initDatabase } from './sqlite-db.js';
import { createId } from '../utils/text.js';

function mostCommon(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function archiveLabel(leads, createdAt) {
  const category = mostCommon(leads.map((lead) => lead.categoria));
  const city = mostCommon(leads.map((lead) => lead.cidade));
  const context = [category, city].filter(Boolean).join(' em ');
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(createdAt));
  return context ? `${context} - ${date}` : `Busca de ${date}`;
}

export class ArchiveStore {
  constructor(db = null) {
    this.db = db;
  }

  async init() {
    if (!this.db) {
      this.db = initDatabase();
    }
    return this;
  }

  list() {
    const rows = this.db.prepare(`SELECT * FROM local_archives ORDER BY created_at DESC`).all();
    return rows.map((row) => {
      let leads = [];
      try { leads = JSON.parse(row.leads_json || '[]'); } catch {}
      return {
        id: row.id,
        label: row.label,
        count: Number(row.count || leads.length),
        createdAt: row.created_at,
        preview: leads.slice(0, 4).map((l) => l.empresa)
      };
    });
  }

  get(id) {
    const row = this.db.prepare(`SELECT * FROM local_archives WHERE id = ?`).get(String(id));
    if (!row) return null;
    let leads = [];
    try { leads = JSON.parse(row.leads_json || '[]'); } catch {}
    return {
      id: row.id,
      label: row.label,
      count: Number(row.count || leads.length),
      createdAt: row.created_at,
      leads
    };
  }

  allLeads() {
    const rows = this.db.prepare(`SELECT leads_json FROM local_archives`).all();
    const all = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.leads_json || '[]');
        if (Array.isArray(parsed)) all.push(...parsed);
      } catch {}
    }
    return all;
  }

  favoriteLeads() {
    return this.allLeads().filter((lead) => lead.favorite);
  }

  async setFavorite(id, favorite) {
    const rows = this.db.prepare(`SELECT id, leads_json FROM local_archives`).all();
    let updatedLead = null;

    for (const row of rows) {
      try {
        const leads = JSON.parse(row.leads_json || '[]');
        let modified = false;
        for (const lead of leads) {
          if (lead.id === id) {
            lead.favorite = Boolean(favorite);
            lead.updatedAt = new Date().toISOString();
            updatedLead = structuredClone(lead);
            modified = true;
          }
        }
        if (modified) {
          this.db.prepare(`UPDATE local_archives SET leads_json = ? WHERE id = ?`)
            .run(JSON.stringify(leads), row.id);
        }
      } catch {}
    }

    return updatedLead;
  }

  async create(leads) {
    if (!Array.isArray(leads) || leads.length === 0) {
      throw new Error('Não há leads na tela para arquivar.');
    }
    const createdAt = new Date().toISOString();
    const id = createId('archive');
    const label = archiveLabel(leads, createdAt);

    this.db.prepare(`
      INSERT INTO local_archives (id, label, count, leads_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, label, leads.length, JSON.stringify(leads), createdAt);

    return { id, label, count: leads.length, createdAt };
  }
}
