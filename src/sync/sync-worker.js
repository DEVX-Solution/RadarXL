import { getSupabase, getCurrentUser, isSupabaseConfigured } from './supabase-client.js';
import { initDatabase } from '../storage/sqlite-db.js';
import { logger } from '../utils/logger.js';
import { normalizeDomain, normalizePhone } from '../utils/text.js';

export class SyncWorker {
  constructor(db = null) {
    this.db = db || initDatabase();
    this.timer = null;
    this.isSyncing = false;
    this.lastSyncAt = null;
    this.realtimeChannel = null;
    this.onRemoteUpdate = () => {};
  }

  start(intervalMs = 5000) {
    if (this.timer) return;
    logger.info('Iniciando SyncWorker de sincronização em segundo plano...');
    
    // Tentativa inicial
    this.sync().catch(() => {});

    this.timer = setInterval(() => {
      this.sync().catch((err) => {
        logger.debug('Falha no ciclo de sincronização:', { error: err.message });
      });
    }, intervalMs);

    this.setupRealtime().catch(() => {});
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe().catch(() => {});
      this.realtimeChannel = null;
    }
    logger.info('SyncWorker finalizado.');
  }

  getPendingCount() {
    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'
      `).get();
      return Number(row?.count || 0);
    } catch {
      return 0;
    }
  }

  async getStatus() {
    const userSession = await getCurrentUser();
    return {
      isConfigured: isSupabaseConfigured(),
      isAuthenticated: Boolean(userSession?.user),
      userEmail: userSession?.user?.email || null,
      teamId: userSession?.profile?.team_id || null,
      teamName: userSession?.profile?.teams?.name || null,
      pendingCount: this.getPendingCount(),
      lastSyncAt: this.lastSyncAt,
      isSyncing: this.isSyncing
    };
  }

  async setupRealtime() {
    const supabase = getSupabase();
    if (!supabase) return;

    const userSession = await getCurrentUser();
    const teamId = userSession?.profile?.team_id;
    if (!teamId) return;

    if (this.realtimeChannel) {
      await this.realtimeChannel.unsubscribe().catch(() => {});
    }

    this.realtimeChannel = supabase
      .channel(`team-sync-${teamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'searches', filter: `team_id=eq.${teamId}` },
        (payload) => this.handleRemoteSearchChange(payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `team_id=eq.${teamId}` },
        (payload) => this.handleRemoteLeadChange(payload)
      )
      .subscribe((status) => {
        logger.info(`Realtime conectado para equipe ${teamId}: ${status}`);
      });
  }

  handleRemoteSearchChange(payload) {
    try {
      const { new: record, eventType } = payload;
      if (eventType === 'DELETE') return;
      if (!record || !record.id) return;

      this.db.prepare(`
        INSERT INTO local_searches (
          id, categoria, cidade, estado, limite, status, progress_percent,
          completed_count, desired_count, scanned_count, discarded_count,
          repeated_count, error_message, created_by_name, created_by_id,
          team_id, created_at, updated_at, synced_at
        ) VALUES (
          @id, @categoria, @cidade, @estado, @limite, @status, @progress_percent,
          @completed_count, @desired_count, @scanned_count, @discarded_count,
          @repeated_count, @error_message, @created_by_name, @created_by_id,
          @team_id, @created_at, @updated_at, @synced_at
        ) ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          progress_percent = excluded.progress_percent,
          completed_count = excluded.completed_count,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at,
          synced_at = excluded.synced_at;
      `).run({
        id: record.id,
        categoria: record.categoria || '',
        cidade: record.cidade || '',
        estado: record.estado || '',
        limite: record.limite || 10,
        status: record.status || 'concluido',
        progress_percent: record.progress_percent || 100,
        completed_count: record.completed_count || 0,
        desired_count: record.desired_count || 0,
        scanned_count: record.scanned_count || 0,
        discarded_count: record.discarded_count || 0,
        repeated_count: record.repeated_count || 0,
        error_message: record.error_message || '',
        created_by_name: record.created_by_name || 'Operador',
        created_by_id: record.created_by || null,
        team_id: record.team_id || null,
        created_at: record.created_at || new Date().toISOString(),
        updated_at: record.updated_at || new Date().toISOString(),
        synced_at: new Date().toISOString()
      });

      this.onRemoteUpdate({ type: 'search', id: record.id, record });
    } catch (err) {
      logger.warn('Erro ao processar alteração remota de pesquisa', { error: err.message });
    }
  }

  handleRemoteLeadChange(payload) {
    try {
      const { new: record, eventType } = payload;
      if (eventType === 'DELETE') {
        if (payload.old?.id) {
          this.db.prepare(`DELETE FROM local_leads WHERE id = ?`).run(payload.old.id);
        }
        return;
      }
      if (!record || !record.id) return;

      const stmt = this.db.prepare(`
        INSERT INTO local_leads (
          id, empresa, categoria, cidade, estado, site, instagram, instagram_url,
          email, telefone, status, score, favorite, fonte, google_place_id, osm_id,
          maps_url, screenshot_path, auditoria_json, website_data_json,
          instagram_details_json, problemas_json, analise_ia, mensagem_personalizada,
          canal_recomendado, ai_provider, created_at, updated_at, synced_at
        ) VALUES (
          @id, @empresa, @categoria, @cidade, @estado, @site, @instagram, @instagram_url,
          @email, @telefone, @status, @score, @favorite, @fonte, @google_place_id, @osm_id,
          @maps_url, @screenshot_path, @auditoria_json, @website_data_json,
          @instagram_details_json, @problemas_json, @analise_ia, @mensagem_personalizada,
          @canal_recomendado, @ai_provider, @created_at, @updated_at, @synced_at
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
          updated_at = excluded.updated_at,
          synced_at = excluded.synced_at;
      `);

      stmt.run({
        id: record.id,
        empresa: record.empresa || '',
        categoria: record.categoria || '',
        cidade: record.cidade || '',
        estado: record.estado || '',
        site: record.site || '',
        instagram: record.instagram || '',
        instagram_url: record.instagram_url || '',
        email: record.email || '',
        telefone: record.telefone || '',
        status: record.status || 'descoberto',
        score: Number(record.score || 0),
        favorite: record.favorite ? 1 : 0,
        fonte: record.fonte || '',
        google_place_id: record.google_place_id || null,
        osm_id: record.osm_id || null,
        maps_url: record.maps_url || '',
        screenshot_path: record.screenshot_url || '',
        auditoria_json: JSON.stringify(record.auditoria || {}),
        website_data_json: JSON.stringify(record.website_data || {}),
        instagram_details_json: JSON.stringify(record.instagram_details || {}),
        problemas_json: JSON.stringify(record.problemas || []),
        analise_ia: record.analise_ia || '',
        mensagem_personalizada: record.mensagem_personalizada || '',
        canal_recomendado: record.canal_recomendado || '',
        ai_provider: record.ai_provider || '',
        created_at: record.created_at || new Date().toISOString(),
        updated_at: record.updated_at || new Date().toISOString(),
        synced_at: new Date().toISOString()
      });

      this.onRemoteUpdate({ type: 'lead', id: record.id, record });
    } catch (err) {
      logger.warn('Erro ao processar alteração remota de lead', { error: err.message });
    }
  }

  async sync() {
    if (this.isSyncing) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const userSession = await getCurrentUser();
    if (!userSession?.user || !userSession?.profile?.team_id) {
      return; // Usuário não autenticado ou sem equipe associada
    }

    const teamId = userSession.profile.team_id;
    this.isSyncing = true;

    try {
      const pendingItems = this.db.prepare(`
        SELECT * FROM sync_queue
        WHERE status = 'pending' AND attempts < 5
        ORDER BY id ASC LIMIT 25
      `).all();

      if (pendingItems.length === 0) {
        this.lastSyncAt = new Date().toISOString();
        return;
      }

      for (const item of pendingItems) {
        try {
          if (item.entity_type === 'lead') {
            const lead = JSON.parse(item.payload_json || '{}');
            const domain = normalizeDomain(lead.site || '');
            const phoneNorm = normalizePhone(lead.contato?.telefone || lead.telefone || '');

            const payloadLead = {
              id: lead.id,
              empresa: lead.empresa,
              categoria: lead.categoria || '',
              cidade: lead.cidade || '',
              estado: lead.estado || '',
              site: lead.site || '',
              site_domain: domain,
              instagram: lead.instagram || '',
              instagram_url: lead.instagram_url || '',
              email: lead.contato?.email || lead.email || '',
              telefone: lead.contato?.telefone || lead.telefone || '',
              telefone_normalizado: phoneNorm,
              status: lead.status || 'descoberto',
              score: Number(lead.score || 0),
              favorite: Boolean(lead.favorite),
              fonte: lead.fonte || 'RadarXL',
              google_place_id: lead.googlePlaceId || null,
              osm_id: lead.osmId || null,
              maps_url: lead.maps_url || lead.google_maps_url || '',
              auditoria: lead.auditoria || {},
              website_data: lead.websiteData || {},
              instagram_details: lead.instagramDetails || {},
              problemas: lead.problemas || [],
              analise_ia: lead.analise_ia || '',
              mensagem_personalizada: lead.mensagem_personalizada || '',
              canal_recomendado: lead.canal_recomendado || '',
              ai_provider: lead.ai_provider || ''
            };

            // Chamada idempotente à função RPC no PostgreSQL
            const { error: rpcError } = await supabase.rpc('upsert_team_lead', {
              p_lead: payloadLead,
              p_search_id: lead.searchId || null
            });

            if (rpcError) {
              // Fallback para upsert direto se a RPC não existir
              const { error: upsertError } = await supabase.from('leads').upsert({
                ...payloadLead,
                team_id: teamId
              });
              if (upsertError) throw upsertError;
            }
          } else if (item.entity_type === 'search') {
            const search = JSON.parse(item.payload_json || '{}');
            const { error } = await supabase.from('searches').upsert({
              id: search.id,
              team_id: teamId,
              categoria: search.categoria,
              cidade: search.cidade,
              estado: search.estado || '',
              limite: search.limite || 10,
              status: search.status || 'executando',
              progress_percent: search.progress_percent || 0,
              completed_count: search.completed_count || 0,
              desired_count: search.desired_count || 0,
              created_by: userSession.user.id,
              created_by_name: userSession.profile.full_name || userSession.user.email
            });
            if (error) throw error;
          } else if (item.entity_type === 'favorite') {
            const { favorite } = JSON.parse(item.payload_json || '{}');
            const { error } = await supabase
              .from('leads')
              .update({ favorite: Boolean(favorite), updated_at: new Date().toISOString() })
              .eq('id', item.entity_id)
              .eq('team_id', teamId);
            if (error) throw error;
          }

          // Marcar como sincronizado com sucesso
          this.db.prepare(`
            UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE id = ?
          `).run(new Date().toISOString(), item.id);

          this.db.prepare(`
            DELETE FROM sync_queue WHERE id = ?
          `).run(item.id);

        } catch (itemError) {
          logger.warn(`Erro ao sincronizar item ${item.entity_type}:${item.entity_id}`, { error: itemError.message });
          this.db.prepare(`
            UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?
          `).run(itemError.message, new Date().toISOString(), item.id);
        }
      }

      this.lastSyncAt = new Date().toISOString();
    } catch (globalError) {
      logger.warn('Erro global na sincronização:', { error: globalError.message });
    } finally {
      this.isSyncing = false;
    }
  }
}
