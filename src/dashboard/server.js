import express from 'express';
import path from 'node:path';
import { config, publicConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { hasDigitalPresence } from '../utils/lead-eligibility.js';
import { createLeadIdentitySet, isKnownLead, leadIdentityKeys } from '../utils/lead-identity.js';
import { createFallbackAudit } from '../audit/website-audit.js';
import { getSystemMetrics } from '../utils/system-metrics.js';
import { signIn, signOut, signUp, getCurrentUser, getTeamInfo, generateTeamInvite, joinTeamWithCode, createTeam, leaveTeam } from '../sync/supabase-client.js';

export function withRecoveredAudit(lead) {
  const audit = lead.auditoria || {};
  const lostScores = [audit.performance, audit.seo, audit.acessibilidade]
    .every((value) => Number(value || 0) === 0);
  const browserFailure = Boolean(audit.error) && /chrome|browser|navegador|puppeteer/i.test(audit.error);

  if (!lead.site || lead.websiteData?.reachable !== true || !lostScores || !browserFailure) return lead;
  return {
    ...lead,
    auditoria: createFallbackAudit(
      lead,
      lead.websiteData,
      new Error('A auditoria anterior não encontrou um navegador compatível.')
    )
  };
}

export function visibleLeads(store, archiveStore, options = {}) {
  const archivedIdentities = createLeadIdentitySet(archiveStore.allLeads());
  return store.list(options).filter((lead) => (
    lead.restoredFromArchive || !isKnownLead(lead, archivedIdentities)
  )).map(withRecoveredAudit);
}

export function favoriteLeads(store, archiveStore) {
  const favorites = [
    ...store.all().filter((lead) => lead.favorite),
    ...archiveStore.favoriteLeads()
  ];
  const seen = new Set();
  return favorites
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .filter((lead) => {
      const keys = [...leadIdentityKeys(lead)];
      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    })
    .map(withRecoveredAudit);
}

function validateDiscovery(body) {
  const categoria = String(body.categoria || '').trim();
  const cidade = String(body.cidade || '').trim();
  const estado = String(body.estado || '').trim().toUpperCase().slice(0, 2);
  const limite = Math.min(Math.max(Number(body.limite) || 10, 1), config.maxLeadsPerSearch);
  const auditMode = ['economico', 'completo', 'profissional'].includes(body.auditMode)
    ? body.auditMode
    : (body.lighthouseEnabled ? 'profissional' : 'economico');

  if (!categoria) throw new Error('Informe a categoria de negócio.');
  if (!cidade) throw new Error('Informe a cidade.');
  return {
    categoria,
    cidade,
    estado,
    limite,
    auditMode,
    demo: body.demo === true,
    lighthouseEnabled: auditMode === 'profissional' || body.lighthouseEnabled === true,
    screenshotEnabled: auditMode === 'profissional' || body.screenshotEnabled === true
  };
}

function manualLead(body) {
  const empresa = String(body.empresa || '').trim();
  if (!empresa) throw new Error('Informe o nome da empresa.');
  const instagram = String(body.instagram || '').trim().replace(/^@?/, '@');
  const lead = {
    empresa,
    categoria: String(body.categoria || '').trim(),
    cidade: String(body.cidade || '').trim(),
    estado: String(body.estado || '').trim().toUpperCase().slice(0, 2),
    site: String(body.site || '').trim(),
    instagram: instagram === '@' ? '' : instagram,
    instagram_url: instagram && instagram !== '@' ? `https://www.instagram.com/${instagram.slice(1)}/` : '',
    contato: {
      email: String(body.email || '').trim(),
      telefone: String(body.telefone || '').trim()
    },
    status: 'descoberto',
    fonte: 'Cadastro manual',
    auditoria: {},
    problemas: []
  };
  if (!hasDigitalPresence(lead)) {
    throw new Error('Informe pelo menos o website ou o Instagram da empresa.');
  }
  return lead;
}

export function createServer({ store, archiveStore, pipeline, jobs, syncWorker = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Habilitar CORS para o WebView2 / Tauri e origens locais
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Autenticação de processo local (opcional via bearer token para quando o Tauri chamar)
  app.use((req, res, next) => {
    const requiredToken = process.env.LOCAL_API_SECRET;
    if (!requiredToken) return next();
    const authHeader = req.headers.authorization;
    if (req.path.startsWith('/api') && authHeader !== `Bearer ${requiredToken}`) {
      return res.status(401).json({ error: 'Acesso não autorizado ao processo local.' });
    }
    next();
  });

  app.use('/screenshots', express.static(config.screenshotDir, { fallthrough: false }));
  app.use(express.static(path.join(config.rootDir, 'public')));

  // Telemetria e Métricas do Sistema (RAM, CPU, Processos)
  app.get('/api/metrics', (_req, res) => {
    const activeJobs = jobs.list().filter((j) => j.status === 'executando').length;
    res.json(getSystemMetrics(activeJobs, 0));
  });

  // Rotas de Sincronização e Supabase
  app.get('/api/sync/status', async (_req, res) => {
    if (!syncWorker) return res.json({ isConfigured: false, isAuthenticated: false });
    const status = await syncWorker.getStatus();
    res.json(status);
  });

  app.post('/api/sync/trigger', async (_req, res) => {
    if (syncWorker) {
      syncWorker.sync().catch(() => {});
      return res.json({ ok: true, message: 'Ciclo de sincronização iniciado.' });
    }
    res.status(400).json({ error: 'SyncWorker inativo.' });
  });

  app.get('/api/auth/me', async (_req, res) => {
    const userSession = await getCurrentUser();
    res.json({
      user: userSession?.user || null,
      profile: userSession?.profile || null
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const data = await signIn(email, password);
      if (syncWorker) {
        syncWorker.setupRealtime().catch(() => {});
        syncWorker.sync().catch(() => {});
      }
      res.json({ ok: true, user: data.user });
    } catch (err) {
      res.status(401).json({ error: err.message || 'Falha ao autenticar.' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, fullName, teamName, inviteCode } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
      }
      const data = await signUp(email, password, fullName, teamName, inviteCode);
      if (syncWorker && data.session) {
        syncWorker.setupRealtime().catch(() => {});
        syncWorker.sync().catch(() => {});
      }
      res.json({
        ok: true,
        user: data.user,
        requiresConfirmation: data.requiresConfirmation,
        message: data.requiresConfirmation
          ? 'Conta criada! Se a confirmação de e-mail estiver ativa no Supabase, confirme o link enviado.'
          : (inviteCode ? 'Conta criada e você entrou na equipe com sucesso!' : 'Conta criada e equipe conectada com sucesso!')
      });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Falha ao registrar conta.' });
    }
  });

  app.get('/api/team/info', async (_req, res) => {
    try {
      const info = await getTeamInfo();
      res.json(info || { team: null, members: [], invitations: [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/team/create', async (req, res) => {
    try {
      const { teamName } = req.body;
      const result = await createTeam(teamName);
      if (syncWorker) {
        syncWorker.setupRealtime().catch(() => {});
        syncWorker.sync().catch(() => {});
      }
      res.json({ ok: true, result });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Falha ao criar equipe.' });
    }
  });

  app.post('/api/team/invite', async (req, res) => {
    try {
      const { maxUses, customCode } = req.body;
      const invite = await generateTeamInvite(maxUses, customCode);
      res.json({ ok: true, invite });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Falha ao gerar convite.' });
    }
  });

  app.post('/api/team/join', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Código de convite obrigatório.' });
      const result = await joinTeamWithCode(code);
      if (syncWorker) {
        syncWorker.setupRealtime().catch(() => {});
        syncWorker.sync().catch(() => {});
      }
      res.json({ ok: true, result });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Falha ao ingressar na equipe.' });
    }
  });

  app.post('/api/team/leave', async (_req, res) => {
    try {
      await leaveTeam();
      if (syncWorker) {
        syncWorker.setupRealtime().catch(() => {});
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Falha ao sair da equipe.' });
    }
  });

  app.post('/api/auth/logout', async (_req, res) => {
    await signOut();
    if (syncWorker) syncWorker.setupRealtime().catch(() => {});
    res.json({ ok: true });
  });

  // Pesquisas da Equipe (Compartilhadas no SQLite / Supabase)
  app.get('/api/team/searches', (_req, res) => {
    try {
      const db = store.db;
      const searches = db.prepare(`
        SELECT * FROM local_searches ORDER BY created_at DESC LIMIT 50
      `).all();
      res.json(searches);
    } catch {
      res.json([]);
    }
  });

  // Endpoints Principais de Leads
  app.get('/api/health', (_request, response) => response.json({ ok: true, time: new Date().toISOString() }));
  app.get('/api/config', (_request, response) => response.json(publicConfig()));
  
  app.get('/api/leads', (request, response) => {
    response.json(visibleLeads(store, archiveStore, {
      minScore: request.query.minScore,
      search: request.query.search
    }));
  });

  app.get('/api/favorites', (_request, response) => {
    response.json(favoriteLeads(store, archiveStore));
  });

  app.get('/api/leads/:id', (request, response) => {
    const lead = store.get(request.params.id);
    if (!lead) return response.status(404).json({ error: 'Lead não encontrado.' });
    return response.json(withRecoveredAudit(lead));
  });

  app.patch('/api/leads/:id/favorite', async (request, response, next) => {
    try {
      const favorite = Boolean(request.body.favorite);
      const activeLead = await store.setFavorite(request.params.id, favorite);
      const archivedLead = await archiveStore.setFavorite(request.params.id, favorite);
      const lead = activeLead || archivedLead;
      if (!lead) return response.status(404).json({ error: 'Lead não encontrado.' });
      return response.json(lead);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/leads/archive', async (_request, response, next) => {
    try {
      if (jobs.list().some((job) => job.status === 'executando')) {
        return response.status(409).json({ error: 'Aguarde a busca atual terminar antes de arquivar.' });
      }
      const leads = visibleLeads(store, archiveStore);
      const archive = await archiveStore.create(leads);
      await store.clear();
      return response.status(201).json({ id: archive.id, label: archive.label, count: archive.count });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/discover', async (request, response, next) => {
    try {
      const query = validateDiscovery(request.body);
      const searchId = `search_${Date.now()}`;
      
      // Registrar pesquisa no SQLite local e na fila de sincronização compartilhada
      try {
        const now = new Date().toISOString();
        const userSession = await getCurrentUser();
        store.db.prepare(`
          INSERT INTO local_searches (
            id, categoria, cidade, estado, limite, status, progress_percent,
            desired_count, created_by_name, created_by_id, team_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'executando', 0, ?, ?, ?, ?, ?, ?)
        `).run(
          searchId, query.categoria, query.cidade, query.estado, query.limite,
          query.limite, userSession?.profile?.full_name || 'Operador Local',
          userSession?.user?.id || null, userSession?.profile?.team_id || null,
          now, now
        );

        store.db.prepare(`
          INSERT INTO sync_queue (entity_type, entity_id, operation, payload_json, status, created_at, updated_at)
          VALUES ('search', ?, 'UPSERT', ?, 'pending', ?, ?)
        `).run(searchId, JSON.stringify({
          id: searchId,
          categoria: query.categoria,
          cidade: query.cidade,
          estado: query.estado,
          limite: query.limite,
          status: 'executando'
        }), now, now);
      } catch {}

      const job = jobs.create({ ...query, searchId }, (progress) => {
        // Atualizar progresso no SQLite local
        try {
          if (progress.completed !== undefined) {
            const percent = query.limite ? Math.round((progress.completed / query.limite) * 100) : 0;
            store.db.prepare(`
              UPDATE local_searches
              SET progress_percent = ?, completed_count = ?, scanned_count = ?, discarded_count = ?, repeated_count = ?, updated_at = ?
              WHERE id = ?
            `).run(
              percent, progress.completed || 0, progress.scanned || 0,
              progress.discarded || 0, progress.repeated || 0, new Date().toISOString(), searchId
            );
          }
        } catch {}
        return pipeline.discover(query, progress);
      });

      return response.status(202).json(job);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/leads', async (request, response, next) => {
    try {
      const lead = await store.upsert(manualLead(request.body));
      const job = jobs.create({ leadId: lead.id }, async (progress) => {
        progress({ phase: 'processing', total: 1, completed: 0, current: lead.empresa });
        const result = await pipeline.process(lead, {
          lighthouseEnabled: request.body.lighthouseEnabled === true,
          screenshotEnabled: request.body.screenshotEnabled === true
        });
        progress({ phase: 'processing', total: 1, completed: 1, current: lead.empresa });
        return result ? [result] : [];
      });
      return response.status(202).json(job);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/leads/:id/reanalyze', (request, response) => {
    const lead = store.get(request.params.id);
    if (!lead) return response.status(404).json({ error: 'Lead não encontrado.' });
    const auditMode = request.body.auditMode || 'completo';
    const job = jobs.create({ leadId: lead.id }, async (progress) => {
      progress({ phase: 'processing', total: 1, completed: 0, current: lead.empresa });
      const result = await pipeline.process(lead, {
        auditMode,
        lighthouseEnabled: auditMode === 'profissional' || request.body.lighthouseEnabled === true,
        screenshotEnabled: auditMode === 'profissional' || request.body.screenshotEnabled === true
      });
      progress({ phase: 'processing', total: 1, completed: 1, current: lead.empresa });
      return result ? [result] : [];
    });
    return response.status(202).json(job);
  });

  app.delete('/api/leads/:id', async (request, response) => {
    const removed = await store.remove(request.params.id);
    return response.status(removed ? 204 : 404).end();
  });

  app.get('/api/archives', (_request, response) => response.json(archiveStore.list()));
  
  app.get('/api/archives/:id', (request, response) => {
    const archive = archiveStore.get(request.params.id);
    if (!archive) return response.status(404).json({ error: 'Busca arquivada não encontrada.' });
    return response.json(archive);
  });

  app.post('/api/archives/:id/restore', async (request, response, next) => {
    try {
      if (jobs.list().some((job) => job.status === 'executando')) {
        return response.status(409).json({ error: 'Aguarde a busca atual terminar antes de restaurar.' });
      }
      const archive = archiveStore.get(request.params.id);
      if (!archive) return response.status(404).json({ error: 'Busca arquivada não encontrada.' });
      for (const lead of archive.leads) {
        await store.upsert({ ...lead, restoredFromArchive: archive.id });
      }
      return response.json({ restored: archive.leads.length });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/jobs', (_request, response) => response.json(jobs.list()));
  
  app.get('/api/jobs/:id', (request, response) => {
    const job = jobs.get(request.params.id);
    if (!job) return response.status(404).json({ error: 'Processamento não encontrado.' });
    return response.json(job);
  });

  app.use('/api', (request, response) => response.status(404).json({ error: 'Rota não encontrada.' }));
  
  app.use((request, response, next) => {
    if (request.method !== 'GET') return next();
    return response.sendFile(path.join(config.rootDir, 'public', 'index.html'));
  });

  app.use((error, _request, response, _next) => {
    logger.error('Erro na API', { error });
    response.status(400).json({ error: error.message || 'Erro inesperado.' });
  });

  return app;
}
