import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { initDatabase } from './sqlite-db.js';
import { logger } from '../utils/logger.js';
import { normalizeDomain, normalizePhone, normalizeText } from '../utils/text.js';

export async function runJsonMigration(options = {}) {
  const db = options.db || initDatabase();
  const leadsFile = options.leadsFile || config.leadsFile;
  const archivesFile = options.archivesFile || config.archivesFile;
  const backupDir = path.join(config.dataDir, 'backup_pre_migration');

  const report = {
    startedAt: new Date().toISOString(),
    leadsFoundInJson: 0,
    leadsMigrated: 0,
    leadsDeduplicated: 0,
    archivesFoundInJson: 0,
    archivesMigrated: 0,
    backupCreated: false,
    backupPaths: [],
    errors: []
  };

  try {
    await fs.mkdir(backupDir, { recursive: true });

    // 1. Criar Backup dos arquivos JSON existentes
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (existsSync(leadsFile)) {
      const backupLeadsPath = path.join(backupDir, `leads_${timestamp}.json`);
      await fs.copyFile(leadsFile, backupLeadsPath);
      report.backupPaths.push(backupLeadsPath);
      report.backupCreated = true;
    }
    if (existsSync(archivesFile)) {
      const backupArchivesPath = path.join(backupDir, `archives_${timestamp}.json`);
      await fs.copyFile(archivesFile, backupArchivesPath);
      report.backupPaths.push(backupArchivesPath);
      report.backupCreated = true;
    }

    // 2. Migrar Leads
    if (existsSync(leadsFile)) {
      try {
        const raw = await fs.readFile(leadsFile, 'utf8');
        const leads = JSON.parse(raw);
        if (Array.isArray(leads)) {
          report.leadsFoundInJson = leads.length;

          const stmtUpsert = db.prepare(`
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
              auditoria_json = excluded.auditoria_json,
              website_data_json = excluded.website_data_json,
              instagram_details_json = excluded.instagram_details_json,
              problemas_json = excluded.problemas_json,
              analise_ia = excluded.analise_ia,
              mensagem_personalizada = excluded.mensagem_personalizada,
              updated_at = excluded.updated_at;
          `);

          for (const lead of leads) {
            if (!lead || !lead.id || !lead.empresa) continue;
            const now = new Date().toISOString();

            stmtUpsert.run({
              id: String(lead.id),
              empresa: String(lead.empresa || ''),
              categoria: String(lead.categoria || ''),
              cidade: String(lead.cidade || ''),
              estado: String(lead.estado || ''),
              site: String(lead.site || ''),
              instagram: String(lead.instagram || ''),
              instagram_url: String(lead.instagram_url || ''),
              email: String(lead.contato?.email || lead.email || ''),
              telefone: String(lead.contato?.telefone || lead.telefone || ''),
              status: String(lead.status || 'descoberto'),
              score: Number(lead.score || 0),
              favorite: lead.favorite ? 1 : 0,
              fonte: String(lead.fonte || 'OSM/Migração'),
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
              created_at: lead.createdAt || now,
              updated_at: lead.updatedAt || now
            });
            report.leadsMigrated += 1;
          }
        }
      } catch (err) {
        report.errors.push(`Erro ao migrar leads.json: ${err.message}`);
        logger.error('Erro na migração de leads', { error: err });
      }
    }

    // 3. Migrar Arquivos Históricos
    if (existsSync(archivesFile)) {
      try {
        const raw = await fs.readFile(archivesFile, 'utf8');
        const archives = JSON.parse(raw);
        if (Array.isArray(archives)) {
          report.archivesFoundInJson = archives.length;

          const stmtArchive = db.prepare(`
            INSERT INTO local_archives (id, label, count, leads_json, created_at)
            VALUES (@id, @label, @count, @leads_json, @created_at)
            ON CONFLICT(id) DO UPDATE SET
              label = excluded.label,
              count = excluded.count,
              leads_json = excluded.leads_json;
          `);

          for (const arch of archives) {
            if (!arch || !arch.id) continue;
            stmtArchive.run({
              id: String(arch.id),
              label: String(arch.label || 'Busca Arquivada'),
              count: Number(arch.count || arch.leads?.length || 0),
              leads_json: JSON.stringify(arch.leads || []),
              created_at: arch.createdAt || new Date().toISOString()
            });
            report.archivesMigrated += 1;
          }
        }
      } catch (err) {
        report.errors.push(`Erro ao migrar archives.json: ${err.message}`);
        logger.error('Erro na migração de archives', { error: err });
      }
    }

    report.finishedAt = new Date().toISOString();
    report.success = report.errors.length === 0;

    // Salvar relatório
    await fs.writeFile(
      path.join(config.dataDir, 'migration_report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );

    logger.info('Migração para SQLite concluída com sucesso', {
      leads: report.leadsMigrated,
      archives: report.archivesMigrated
    });

    return report;
  } catch (error) {
    logger.error('Falha geral no processo de migração', { error });
    report.errors.push(error.message);
    report.success = false;
    return report;
  }
}
