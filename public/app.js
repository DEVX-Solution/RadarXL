const state = {
  leads: [],
  favorites: [],
  archives: [],
  teamSearches: [],
  config: null,
  activeJob: null,
  pollTimer: null,
  metricsTimer: null,
  onlyFavorites: false,
  currentView: 'dashboard',
  user: null,
  profile: null,
  syncStatus: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function safeUrl(value = '') {
  if (!String(value).trim()) return '';
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function hasVisibleDigitalPresence(lead) {
  const instagram = String(lead.instagram || '').trim();
  const hasInstagram = (instagram && instagram !== '@') || Boolean(safeUrl(lead.instagram_url));
  const hasWebsite = Boolean(safeUrl(lead.site)) && lead.websiteData?.reachable !== false;
  return hasWebsite || hasInstagram;
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function scoreColor(score) {
  if (score >= 70) return 'var(--score-high)';
  if (score >= 40) return 'var(--score-medium)';
  return 'var(--score-low)';
}

function numericScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
}

function host(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

function toast(message) {
  const element = $('#toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('visible'), 2800);
}

const API_BASE = (window.location.protocol === 'http:' && window.location.port === '3000')
  ? ''
  : 'http://127.0.0.1:3000';

async function waitForBackend(maxRetries = 35, delayMs = 200) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // Backend ainda inicializando em segundo plano
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function api(path, options = {}, retries = 2) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  } catch (netErr) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 300));
      return api(path, options, retries - 1);
    }
    throw new Error('O motor local do RadarXL está iniciando ou indisponível em 127.0.0.1:3000. Aguarde alguns instantes.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (response.status === 204) return null;
    throw new Error(`Resposta inesperada do servidor (HTTP ${response.status}). Verifique se o backend local está ativo.`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erro HTTP ${response.status}`);
  }
  return response.json();
}

// NAVEGAÇÃO ENTRE AS 11 SEÇÕES
function switchView(viewName) {
  state.currentView = viewName;
  $$('.nav-item[data-view]').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  const titles = {
    'dashboard': 'Dashboard Comercial',
    'team-searches': 'Pesquisas da Equipe',
    'my-searches': 'Minhas Pesquisas',
    'all-leads': 'Todos os Leads Consolidados',
    'favorites': 'Empresas Favoritadas',
    'archives': 'Buscas Arquivadas',
    'audits': 'Auditorias Técnicas',
    'reports': 'Relatórios & Produtividade',
    'team': 'Gestão da Equipe',
    'settings': 'Configurações do Sistema'
  };
  $('#page-title').textContent = titles[viewName] || 'RadarXL Intelligence';

  // Mostrar visualização correspondente
  $$('.content-view').forEach((view) => view.classList.add('hidden'));
  const targetView = $(`#section-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  if (viewName === 'team-searches') renderTeamSearches();
  if (viewName === 'team') renderTeamView();
  if (viewName === 'all-leads') renderAllLeadsView();
  if (viewName === 'settings') renderSettingsView();
  if (viewName === 'favorites') {
    state.onlyFavorites = true;
    renderLeads();
  } else if (viewName === 'dashboard') {
    state.onlyFavorites = false;
    renderLeads();
  }
}

function updateStats() {
  const completed = state.leads.filter((lead) => lead.status === 'concluido');
  const audited = completed.filter((lead) => lead.site && numericScore(lead.auditoria?.performance) !== null);
  const average = audited.length
    ? Math.round(audited.reduce((sum, lead) => sum + numericScore(lead.auditoria.performance), 0) / audited.length)
    : null;
  $('#stat-hot').textContent = state.leads.filter((lead) => lead.score >= 70).length;
  $('#stat-total').textContent = state.leads.length;
  $('#stat-completed').textContent = `${completed.length} análises concluídas`;
  $('#stat-no-site').textContent = state.leads.filter((lead) => !lead.site).length;
  $('#stat-performance').textContent = average === null ? '--' : average;
}

function updateArchiveButton() {
  const button = $('#archive-current');
  if (!button) return;
  button.disabled = state.leads.length === 0 || Boolean(state.activeJob);
}

function leadRow(lead) {
  const performance = numericScore(lead.auditoria?.performance);
  const instagramQuality = numericScore(lead.instagramDetails?.qualityScore);
  const siteLink = safeUrl(lead.site);
  const instagramLink = safeUrl(lead.instagram_url);
  return `
    <article class="lead-row${lead.favorite ? ' favorite' : ''}" data-id="${escapeHtml(lead.id)}">
      <div class="company">
        <span class="company-avatar">${escapeHtml(initials(lead.empresa))}</span>
        <span class="company-copy">
          <strong>${escapeHtml(lead.empresa)}</strong>
          <span>${escapeHtml([lead.categoria, lead.cidade, lead.estado].filter(Boolean).join(' · '))}</span>
        </span>
      </div>
      <div class="digital-links">
        ${siteLink ? `<a href="${escapeHtml(siteLink)}" target="_blank" rel="noopener">↗ ${escapeHtml(host(siteLink))}</a>` : '<span class="missing">Sem site ativo</span>'}
        ${instagramLink ? `<a href="${escapeHtml(instagramLink)}" target="_blank" rel="noopener">◎ ${escapeHtml(lead.instagram)}</a>` : '<span class="missing">Sem Instagram</span>'}
      </div>
      <div class="metric"${lead.auditoria?.estimated ? ' title="Nota técnica estimada"' : ''}>
        <span>Site${lead.auditoria?.estimated ? ' ~' : ''}</span>
        <strong>${performance ?? '--'}</strong>
        <span class="mini-bar"><i style="width:${performance ?? 0}%"></i></span>
      </div>
      <div class="metric">
        <span>Instagram</span>
        <strong>${instagramQuality ?? '--'}</strong>
        <span class="mini-bar"><i style="width:${instagramQuality ?? 0}%"></i></span>
      </div>
      <div class="status-cell">
        <span class="status-badge ${escapeHtml(lead.status)}">${escapeHtml((lead.status || 'descoberto').replace('_', ' '))}</span>
      </div>
      <div class="row-actions">
        <button class="favorite-button${lead.favorite ? ' active' : ''}" type="button" data-action="toggle-favorite" data-id="${escapeHtml(lead.id)}" aria-label="${lead.favorite ? 'Remover dos favoritos' : 'Favoritar'}">
          ${lead.favorite ? '★' : '☆'}
        </button>
        <span class="score-pill" title="Score de Oportunidade">${Number(lead.score || 0)}</span>
        <button class="row-button" type="button" data-action="view" title="Ver detalhes">→</button>
      </div>
    </article>`;
}

function renderLeads() {
  const searchInput = $('#lead-search');
  const search = searchInput ? searchInput.value.toLocaleLowerCase('pt-BR').trim() : '';
  const scoreFilter = $('#score-filter');
  const minScore = scoreFilter ? Number(scoreFilter.value) : 0;
  const source = state.onlyFavorites ? state.favorites : state.leads;
  
  const favCount = $('#favorite-count');
  if (favCount) favCount.textContent = state.favorites.length;
  
  const favFilter = $('#favorite-filter');
  if (favFilter) {
    favFilter.classList.toggle('active', state.onlyFavorites);
    favFilter.setAttribute('aria-pressed', String(state.onlyFavorites));
  }

  const filtered = source
    .filter((lead) => Number(lead.score || 0) >= minScore)
    .filter((lead) => {
      const haystack = [lead.empresa, lead.categoria, lead.cidade, lead.estado, lead.instagram].join(' ').toLocaleLowerCase('pt-BR');
      return !search || haystack.includes(search);
    });

  const leadList = $('#lead-list');
  if (leadList) {
    leadList.innerHTML = filtered.map(leadRow).join('');
  }
  
  const emptyState = $('#empty-state');
  if (emptyState) {
    emptyState.classList.toggle('hidden', source.length > 0 || search || minScore > 0 || state.onlyFavorites);
  }

  updateStats();
  updateArchiveButton();
}

function renderTeamSearches() {
  const container = $('#team-searches-list');
  if (!container) return;
  if (!state.teamSearches || state.teamSearches.length === 0) {
    container.innerHTML = `<div class="empty-state"><h3>Nenhuma pesquisa registrada</h3><p>Quando os membros da equipe realizarem pesquisas, elas aparecerão aqui em tempo real.</p></div>`;
    return;
  }
  container.innerHTML = state.teamSearches.map((s) => `
    <article class="search-card">
      <div class="search-card-info">
        <strong>${escapeHtml(s.categoria)} em ${escapeHtml(s.cidade)} - ${escapeHtml(s.estado || 'BR')}</strong>
        <span>Responsável: ${escapeHtml(s.created_by_name || 'Operador')} · Data: ${new Date(s.created_at).toLocaleDateString('pt-BR')} ${new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="search-card-meta">
        <span class="status-badge ${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
        <span class="count-badge">${Number(s.completed_count || 0)} / ${Number(s.desired_count || s.limite)} leads</span>
      </div>
    </article>
  `).join('');
}

function renderAllLeadsView() {
  const container = $('#all-leads-container');
  if (!container) return;
  container.innerHTML = `<div class="lead-list">${state.leads.map(leadRow).join('')}</div>`;
}

function renderArchives() {
  const countEl = $('#archive-count');
  if (countEl) countEl.textContent = state.archives.length;
  const list = $('#archive-list');
  if (!list) return;
  if (state.archives.length === 0) {
    list.innerHTML = '<div class="empty-state"><strong>Nenhuma busca arquivada</strong><p>Quando você arquivar a tela atual, o lote aparecerá aqui.</p></div>';
    return;
  }
  list.innerHTML = state.archives.map((archive) => `
    <article class="search-card">
      <div class="search-card-info">
        <strong>${escapeHtml(archive.label)}</strong>
        <span>${new Date(archive.createdAt).toLocaleDateString('pt-BR')} · ${Number(archive.count)} empresa(s)</span>
      </div>
      <button class="button ghost" type="button" data-action="restore-archive" data-id="${escapeHtml(archive.id)}">Restaurar na tela</button>
    </article>
  `).join('');
}

async function renderSettingsView() {
  const container = $('#settings-container');
  if (!container) return;

  container.innerHTML = '<div class="loading-state">Carregando configurações...</div>';

  try {
    const [cfgRes, syncRes] = await Promise.all([
      api('/api/settings').catch(() => ({ settings: {}, stats: {} })),
      api('/api/sync/status').catch(() => ({}))
    ]);

    const s = cfgRes.settings || {};
    const stats = cfgRes.stats || {};

    container.innerHTML = `
      <form id="settings-form" style="display:contents;">
        <!-- CARD 1: PROSPECÇÃO & MOTOR DE BUSCA -->
        <div class="settings-card">
          <div class="settings-card-header">
            <h3>Prospecção e Motor de Busca</h3>
            <p>Ajuste os parâmetros de descoberta de empresas e deduplicação.</p>
          </div>

          <div class="settings-item">
            <label for="cfg-provider">Provedor de Descoberta</label>
            <select id="cfg-provider" name="discoveryProvider">
              <option value="auto" ${s.discoveryProvider === 'auto' ? 'selected' : ''}>Automático (OpenStreetMap + Google Places)</option>
              <option value="openstreetmap" ${s.discoveryProvider === 'openstreetmap' ? 'selected' : ''}>OpenStreetMap (Gratuito e sem limites)</option>
              <option value="google" ${s.discoveryProvider === 'google' ? 'selected' : ''}>Google Places API</option>
            </select>
            <p class="desc">OpenStreetMap opera 100% gratuito sem exigir cartão de crédito ou chaves.</p>
          </div>

          <div class="settings-item">
            <label for="cfg-limit">Limite Padrão por Busca</label>
            <select id="cfg-limit" name="defaultLimit">
              <option value="10" ${Number(s.defaultLimit) === 10 ? 'selected' : ''}>10 empresas</option>
              <option value="20" ${Number(s.defaultLimit) === 20 ? 'selected' : ''}>20 empresas (Recomendado)</option>
              <option value="50" ${Number(s.defaultLimit) === 50 ? 'selected' : ''}>50 empresas</option>
              <option value="100" ${Number(s.defaultLimit) === 100 ? 'selected' : ''}>100 empresas (Busca profunda)</option>
            </select>
            <p class="desc">Quantidade de empresas válidas entregues por ciclo de pesquisa.</p>
          </div>

          <div class="settings-item">
            <label for="cfg-multiplier">Multiplicador de Deduplicação</label>
            <select id="cfg-multiplier" name="candidateMultiplier">
              <option value="4" ${Number(s.candidateMultiplier) === 4 ? 'selected' : ''}>4x candidatos</option>
              <option value="8" ${Number(s.candidateMultiplier) === 8 ? 'selected' : ''}>8x candidatos (Equilíbrio)</option>
              <option value="12" ${Number(s.candidateMultiplier) === 12 ? 'selected' : ''}>12x candidatos (Substituição máxima de repetidos)</option>
            </select>
            <p class="desc">Varre mais candidatos para substituir empresas sem telefone ou duplicadas.</p>
          </div>

          <div class="settings-row" style="margin-top: 6px;">
            <div class="info">
              <p class="title">Ignorar Sites Inacessíveis</p>
              <p class="desc">Descarta empresas com domínio expirado ou erro de servidor.</p>
            </div>
            <input type="checkbox" id="cfg-skip-unreachable" name="skipUnreachableWebsites" ${s.skipUnreachableWebsites ? 'checked' : ''} style="accent-color:var(--accent); width:18px; height:18px; cursor:pointer;">
          </div>
        </div>

        <!-- CARD 2: AUDITORIA TÉCNICA & HARDWARE -->
        <div class="settings-card">
          <div class="settings-card-header">
            <h3>Auditoria Técnica e Desempenho</h3>
            <p>Controle o impacto de uso de memória RAM e processamento no seu computador.</p>
          </div>

          <div class="settings-item">
            <label for="cfg-audit-mode">Modo de Auditoria Padrão</label>
            <select id="cfg-audit-mode" name="auditMode">
              <option value="economico" ${s.auditMode === 'economico' ? 'selected' : ''}>Econômico (50MB RAM - Checagem HTTP/SSL/Tags)</option>
              <option value="intermediario" ${s.auditMode === 'intermediario' ? 'selected' : ''}>Intermediário (Auditoria SEO e Redes Sociais)</option>
              <option value="completo" ${s.auditMode === 'completo' ? 'selected' : ''}>Completo (Lighthouse e Navegador Headless)</option>
            </select>
            <p class="desc">O modo econômico realiza auditorias instantâneas sem pesar no computador.</p>
          </div>

          <div class="settings-item">
            <label for="cfg-timeout">Timeout de Verificação de Site</label>
            <select id="cfg-timeout" name="websitePrecheckTimeoutMs">
              <option value="5000" ${Number(s.websitePrecheckTimeoutMs) === 5000 ? 'selected' : ''}>5 segundos (Rápido)</option>
              <option value="8000" ${Number(s.websitePrecheckTimeoutMs) === 8000 ? 'selected' : ''}>8 segundos (Padrão)</option>
              <option value="15000" ${Number(s.websitePrecheckTimeoutMs) === 15000 ? 'selected' : ''}>15 segundos (Conexões instáveis)</option>
            </select>
            <p class="desc">Tempo limite antes de considerar um website como fora do ar.</p>
          </div>

          <div class="settings-row" style="margin-top: 10px;">
            <div class="info">
              <p class="title">Sincronização em Nuvem (Supabase)</p>
              <p class="desc">Status: <strong style="color:var(--accent-light);">${syncRes.isAuthenticated ? 'Conectado (' + escapeHtml(syncRes.userEmail || '') + ')' : 'Modo Local (Desconectado)'}</strong></p>
            </div>
            <button class="button secondary" type="button" data-action="open-auth" style="font-size:12px; padding:6px 12px;">
              ${syncRes.isAuthenticated ? 'Gerenciar Conta' : 'Conectar'}
            </button>
          </div>

          <div class="settings-actions" style="margin-top:auto;">
            <button class="button primary" type="submit">Salvar Configurações</button>
          </div>
        </div>

        <!-- CARD 3: BANCO DE DADOS & ARMAZENAMENTO LOCAL -->
        <div class="settings-card">
          <div class="settings-card-header">
            <h3>Banco de Dados e Armazenamento</h3>
            <p>Gerenciamento do banco SQLite local de alta performance.</p>
          </div>

          <div class="settings-item">
            <label>Localização do Banco de Dados</label>
            <span class="stat-pill" style="word-break: break-all;">${escapeHtml(stats.dbPath || 'data/radarxl.db')}</span>
            <p class="desc">Armazenamento ACID com WAL ativado para operações simultâneas.</p>
          </div>

          <div class="settings-row">
            <div class="info">
              <p class="title">Empresas Cadastradas no SQLite</p>
              <p class="desc">Total acumulado de leads locais.</p>
            </div>
            <span class="stat-pill">${Number(stats.totalLeads || 0)}</span>
          </div>

          <div class="settings-row">
            <div class="info">
              <p class="title">Histórico de Pesquisas</p>
              <p class="desc">Total de buscas registradas.</p>
            </div>
            <span class="stat-pill">${Number(stats.totalSearches || 0)}</span>
          </div>

          <div style="margin-top: 10px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="button secondary" type="button" id="btn-clear-history" style="font-size:12px;">Limpar Histórico de Buscas</button>
          </div>
        </div>

        <!-- CARD 4: SOBRE O SISTEMA & ATUALIZAÇÕES -->
        <div class="settings-card">
          <div class="settings-card-header">
            <h3>Sobre o RadarXL Intelligence</h3>
            <p>Informações de versão e canal de atualizações automáticas.</p>
          </div>

          <div class="settings-row">
            <div class="info">
              <p class="title">Versão do Aplicativo</p>
              <p class="desc">Build com Auto-Updater e sincronização em equipe.</p>
            </div>
            <span class="stat-pill">v2.0.0</span>
          </div>

          <div class="settings-row">
            <div class="info">
              <p class="title">Canal de Atualização</p>
              <p class="desc">GitHub Releases (DEVX-Solution/RadarXL)</p>
            </div>
            <span class="stat-pill">Oficial</span>
          </div>

          <div class="settings-row">
            <div class="info">
              <p class="title">Desenvolvido por</p>
              <p class="desc">DEVX Solutions</p>
            </div>
          </div>

          <div style="margin-top:auto;">
            <a href="https://github.com/DEVX-Solution/RadarXL/releases" target="_blank" class="button secondary" style="display:inline-block; text-decoration:none; font-size:12px; text-align:center; width:100%;">
              Verificar Atualizações no GitHub
            </a>
          </div>
        </div>
      </form>
    `;

    $('#settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const payload = {
        discoveryProvider: formData.get('discoveryProvider'),
        defaultLimit: Number(formData.get('defaultLimit')),
        candidateMultiplier: Number(formData.get('candidateMultiplier')),
        skipUnreachableWebsites: Boolean($('#cfg-skip-unreachable')?.checked),
        auditMode: formData.get('auditMode'),
        websitePrecheckTimeoutMs: Number(formData.get('websitePrecheckTimeoutMs'))
      };

      try {
        const res = await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast(res.message || 'Configurações salvas com sucesso.');
        await pollMetrics();
      } catch (err) {
        toast(`Erro ao salvar: ${err.message}`);
      }
    });

    $('#btn-clear-history')?.addEventListener('click', async () => {
      if (!confirm('Deseja limpar o histórico de buscas concluídas? Os leads salvos e favoritos não serão apagados.')) return;
      try {
        const res = await api('/api/database/clear-history', { method: 'POST' });
        toast(res.message || 'Histórico limpo.');
        renderSettingsView();
      } catch (err) {
        toast(`Erro: ${err.message}`);
      }
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro ao carregar configurações: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderTeamView() {
  const container = $('#team-view-content');
  if (!container) return;

  container.innerHTML = '<div class="loading-state">Carregando dados da equipe...</div>';

  try {
    const data = await api('/api/team/info');
    if (!data || !data.team) {
      const isAuthenticated = Boolean(state.syncStatus?.isAuthenticated);
      if (isAuthenticated) {
        container.innerHTML = `
          <div style="max-width: 680px; margin: 20px auto;">
            <div class="invite-code-card" style="margin-bottom: 24px;">
              <div class="invite-header">
                <h3>Criar Minha Equipe</h3>
                <p>Você está conectado como <strong>${escapeHtml(state.syncStatus?.userEmail || '')}</strong>. Crie a sua equipe para sincronizar pesquisas e convidar operadores.</p>
              </div>
              <form id="create-team-form" class="invite-generator-form" style="display:flex; gap:12px; margin-top:16px;">
                <input id="create-team-name" type="text" placeholder="Nome da sua Equipe (Ex: DEVX Solutions)" required style="flex:1;">
                <button class="button primary" type="submit">Criar Minha Equipe</button>
              </form>
            </div>

            <div class="invite-code-card">
              <div class="invite-header">
                <h3>Ingressar em uma Equipe Existente</h3>
                <p>Recebeu um código de convite de outro administrador? Digite-o abaixo:</p>
              </div>
              <form id="join-team-empty-form" class="invite-generator-form" style="display:flex; gap:12px; margin-top:16px;">
                <input id="join-empty-code" type="text" placeholder="Código (Ex: 1010)" maxlength="16" required style="width:200px; text-transform:uppercase;">
                <button class="button secondary" type="submit">Ingressar na Equipe</button>
              </form>
            </div>
          </div>
        `;

        $('#create-team-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const teamName = $('#create-team-name').value.trim();
          try {
            const res = await api('/api/team/create', {
              method: 'POST',
              body: JSON.stringify({ teamName })
            });
            toast(`Equipe "${res.result?.team_name || teamName}" criada com sucesso!`);
            await pollMetrics();
            await renderTeamView();
            await loadData();
          } catch (err) {
            toast(`Erro ao criar equipe: ${err.message}`);
          }
        });

        $('#join-team-empty-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const code = $('#join-empty-code').value.trim();
          try {
            const res = await api('/api/team/join', {
              method: 'POST',
              body: JSON.stringify({ code })
            });
            toast(`Você ingressou na equipe ${res.result?.team_name || ''} com sucesso!`);
            await pollMetrics();
            await renderTeamView();
            await loadData();
          } catch (err) {
            toast(`Erro: ${err.message}`);
          }
        });

        return;
      }

      container.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <h3>Nenhuma Conta Conectada</h3>
          <p>Você está operando em Modo Local. Conecte sua conta para criar uma equipe ou entrar com o código de convite do seu time.</p>
          <button class="button primary" type="button" data-action="open-auth" style="margin-top:16px;">Conectar ou Criar Conta</button>
        </div>
      `;
      return;
    }

    const { team, currentUserRole, members, invitations } = data;
    const isAdmin = currentUserRole === 'admin';
    const activeInvite = invitations && invitations.length > 0 ? invitations[0] : null;

    container.innerHTML = `
      <div class="team-banner">
        <div class="team-banner-info">
          <h2>${escapeHtml(team.name)}</h2>
          <p>Equipe ativa na nuvem · ${members.length} membro(s) cadastrado(s)</p>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="role-badge ${isAdmin ? 'admin' : 'member'}">${isAdmin ? 'Administrador' : 'Membro da Equipe'}</span>
          <button class="button secondary" type="button" id="btn-leave-team" style="font-size:12px; padding:6px 14px;">Sair da Equipe</button>
        </div>
      </div>

      ${isAdmin ? `
        <div class="invite-code-card">
          <div class="invite-header">
            <h3>Código de Convite da Equipe</h3>
            <p>Gere um código de 4 a 6 dígitos (ex: 1010) para o seu operador entrar nesta equipe pelo aplicativo dele.</p>
          </div>
          <form id="generate-invite-form" class="invite-generator-form">
            <input id="invite-custom-code" type="text" placeholder="Código (ex: 1010 ou deixe em branco)" maxlength="12" style="width: 220px; text-transform: uppercase;">
            <select id="invite-max-uses">
              <option value="1">Uso Único (1 operador e expira)</option>
              <option value="5">Até 5 operadores</option>
              <option value="999">Ilimitado</option>
            </select>
            <button class="button primary" type="submit">Gerar Código de Convite</button>
          </form>

          ${activeInvite ? `
            <div class="active-code-box">
              <div class="code-display">
                <span class="code-text">${escapeHtml(activeInvite.code || activeInvite.token)}</span>
                <span class="code-badge">${activeInvite.max_uses === 1 ? 'Uso Único' : `${activeInvite.uses_count || 0}/${activeInvite.max_uses} usos`}</span>
              </div>
              <button class="button secondary" type="button" id="btn-copy-code" data-code="${escapeHtml(activeInvite.code || activeInvite.token)}">
                Copiar Código
              </button>
            </div>
          ` : `
            <p style="color:var(--muted); font-size:12px; margin:0;">Nenhum código ativo no momento. Clique no botão acima para gerar.</p>
          `}
        </div>
      ` : ''}

      <div class="invite-code-card">
        <div class="invite-header">
          <h3>Membros Conectados</h3>
          <p>Todos os membros abaixo compartilham pesquisas e leads em tempo real.</p>
        </div>
        <table class="team-members-table">
          <thead>
            <tr>
              <th>Membro</th>
              <th>E-mail</th>
              <th>Função</th>
              <th>Data de Entrada</th>
            </tr>
          </thead>
          <tbody>
            ${members.map((m) => {
              const initials = (m.full_name || m.email || 'U').substring(0, 2).toUpperCase();
              return `
                <tr>
                  <td>
                    <span class="member-avatar">${initials}</span>
                    <strong>${escapeHtml(m.full_name || 'Operador')}</strong>
                  </td>
                  <td style="color:var(--muted);">${escapeHtml(m.email)}</td>
                  <td>
                    <span class="role-badge ${m.role === 'admin' ? 'admin' : 'member'}">${m.role === 'admin' ? 'Admin' : 'Membro'}</span>
                  </td>
                  <td style="color:var(--muted);">${new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="invite-code-card">
        <div class="invite-header">
          <h3>Entrar em outra Equipe por Código</h3>
          <p>Se outro administrador gerou um código de convite para você, digite abaixo para ingressar na equipe dele.</p>
        </div>
        <form id="join-team-form" class="invite-generator-form">
          <input id="join-invite-code" type="text" required placeholder="Digite o código (ex: 1010)" maxlength="16" style="width: 240px; text-transform: uppercase;">
          <button class="button secondary" type="submit">Ingressar na Equipe</button>
        </form>
      </div>
    `;

    $('#join-team-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = $('#join-invite-code').value.trim();
      try {
        const res = await api('/api/team/join', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        toast(`Você ingressou na equipe ${res.result?.team_name || ''} com sucesso!`);
        renderTeamView();
        await pollMetrics();
        await loadData();
      } catch (err) {
        toast(`Erro: ${err.message}`);
      }
    });

    $('#generate-invite-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customCode = $('#invite-custom-code').value.trim();
      const maxUses = Number($('#invite-max-uses').value);
      try {
        const res = await api('/api/team/invite', {
          method: 'POST',
          body: JSON.stringify({ customCode, maxUses })
        });
        toast(`Código de convite ${res.invite?.code} gerado com sucesso!`);
        renderTeamView();
      } catch (err) {
        toast(`Erro: ${err.message}`);
      }
    });

    $('#btn-copy-code')?.addEventListener('click', (e) => {
      const code = e.currentTarget.dataset.code;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          toast(`Código ${code} copiado para a área de transferência!`);
        }).catch(() => {
          toast(`Código: ${code}`);
        });
      }
    });

    $('#btn-leave-team')?.addEventListener('click', async () => {
      if (!confirm('Deseja se desvincular desta equipe? Você poderá criar uma nova com o nome que desejar ou entrar com um código.')) return;
      try {
        await api('/api/team/leave', { method: 'POST' });
        toast('Você saiu da equipe.');
        await pollMetrics();
        await renderTeamView();
      } catch (err) {
        toast(`Erro ao sair da equipe: ${err.message}`);
      }
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Erro ao carregar equipe</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadData() {
  try {
    const [leads, favorites, archives, searches] = await Promise.all([
      api('/api/leads'),
      api('/api/favorites'),
      api('/api/archives'),
      api('/api/team/searches').catch(() => [])
    ]);
    state.leads = leads.filter(hasVisibleDigitalPresence);
    state.favorites = favorites.filter(hasVisibleDigitalPresence);
    state.archives = archives;
    state.teamSearches = searches;
    renderLeads();
    renderArchives();
  } catch (err) {
    console.error('Falha ao atualizar dados:', err);
  }
}

async function pollMetrics() {
  try {
    const [metrics, sync] = await Promise.all([
      api('/api/metrics').catch(() => null),
      api('/api/sync/status').catch(() => null)
    ]);

    if (metrics) {
      $('#metric-ram').textContent = `${metrics.process.ramMb} MB`;
      $('#metric-cpu').textContent = `${metrics.process.cpuPercent} %`;
    }

    if (sync) {
      state.syncStatus = sync;
      const syncBadge = $('#sync-badge');
      const syncText = $('#sync-text');
      if (sync.pendingCount > 0) {
        syncBadge.className = 'status-pill pending';
        syncText.textContent = `${sync.pendingCount} pendente(s)`;
      } else {
        syncBadge.className = 'status-pill synced';
        syncText.textContent = 'Sincronizado';
      }

      const navTeam = $('#nav-team');
      if (sync.isAuthenticated) {
        if (navTeam) navTeam.classList.remove('hidden');
        if (sync.userEmail) {
          $('#user-display-name').textContent = sync.userEmail.split('@')[0];
          $('#user-avatar').textContent = initials(sync.userEmail);
        }
      } else {
        if (navTeam) navTeam.classList.add('hidden');
        $('#user-display-name').textContent = 'Conta Local';
        $('#user-avatar').textContent = 'RX';
        if (state.currentView === 'team') {
          switchView('dashboard');
        }
      }
    }
  } catch {}
}

function showJob(job) {
  state.activeJob = job.id;
  updateArchiveButton();
  const banner = $('#job-banner');
  banner.classList.remove('hidden');
  $('#job-title').textContent = job.status === 'erro' ? 'Erro na análise' : 'Analisando empresas na região...';
  const discarded = job.discarded ? ` · ${job.discarded} descartadas` : '';
  const repeated = job.repeated ? ` · ${job.repeated} conhecidas` : '';
  $('#job-detail').textContent = `${job.error || job.current || 'Buscando empresas'}${discarded}${repeated}`;
  const progress = job.total ? Math.round((job.completed / job.total) * 100) : 10;
  $('#job-progress-bar').style.width = `${Math.max(progress, 8)}%`;
}

async function pollJob(id) {
  clearTimeout(state.pollTimer);
  try {
    const job = await api(`/api/jobs/${id}`);
    showJob(job);
    await loadData();
    if (job.status === 'executando') {
      state.pollTimer = setTimeout(() => pollJob(id), 1800);
    } else {
      setTimeout(() => $('#job-banner').classList.add('hidden'), 3500);
      state.activeJob = null;
      updateArchiveButton();
      toast(job.status === 'concluido' ? 'Pesquisa concluída!' : job.error);
    }
  } catch (error) {
    toast(error.message);
  }
}

function auditItem(label, value, boolean) {
  const className = boolean === undefined ? '' : boolean ? 'yes' : 'no';
  return `<div class="audit-item"><span>${label}</span><strong class="${className}">${escapeHtml(value)}</strong></div>`;
}

function detailHtml(lead) {
  const audit = lead.auditoria || {};
  const ig = lead.instagramDetails || {};
  const screenshot = safeUrl(lead.screenshot_path);
  const site = safeUrl(lead.site);
  const instagram = safeUrl(lead.instagram_url);
  const map = safeUrl(lead.maps_url || lead.google_maps_url);
  const problemItems = (lead.problemas || []).map((problem) => `<li>${escapeHtml(problem)}</li>`).join('');
  const photo = safeUrl(ig.profilePhotoUrl);

  return `
    <div class="detail-wrap">
      <header class="detail-head">
        <div class="detail-company">
          <span class="company-avatar">${escapeHtml(initials(lead.empresa))}</span>
          <div>
            <h2>${escapeHtml(lead.empresa)}</h2>
            <p>${escapeHtml([lead.categoria, lead.cidade, lead.estado].filter(Boolean).join(' · '))}${map ? ` · <a href="${escapeHtml(map)}" target="_blank" rel="noopener">ver no mapa ↗</a>` : ''}</p>
          </div>
        </div>
        <div class="detail-head-actions">
          <button class="button favorite-detail${lead.favorite ? ' active' : ''}" data-action="toggle-favorite" data-id="${escapeHtml(lead.id)}">
            ${lead.favorite ? '★ Favoritado' : '☆ Favoritar'}
          </button>
          <button class="button ghost" data-action="reanalyze" data-id="${escapeHtml(lead.id)}">Reauditar Lead</button>
          <button class="icon-button" data-close="lead-dialog" aria-label="Fechar">×</button>
        </div>
      </header>

      <div class="detail-content">
        <div class="detail-score-row">
          <div class="big-score">
            <strong>${Number(lead.score || 0)}</strong>
            <span>Score RadarXL</span>
          </div>
          <div class="analysis-card">
            <h3>Diagnóstico Consultivo</h3>
            <p>${escapeHtml(lead.analise_ia || lead.processingError || 'Análise comercial gerada para prospecção.')}</p>
          </div>
        </div>

        <div class="audit-grid">
          ${auditItem('Performance', audit.performance ?? '--')}
          ${auditItem('SEO', audit.seo ?? '--')}
          ${auditItem('Acessibilidade', audit.acessibilidade ?? '--')}
          ${auditItem('HTTPS/SSL', audit.ssl ? 'Ativo' : 'Ausente', audit.ssl)}
          ${auditItem('Mobile', audit.mobile_friendly ? 'Bom' : 'Melhorar', audit.mobile_friendly)}
        </div>

        <div class="preview-grid">
          <section class="panel">
            <div class="panel-top">
              <h3>Website Oficial</h3>
              ${site ? `<a href="${escapeHtml(site)}" target="_blank" rel="noopener">Abrir Site ↗</a>` : ''}
            </div>
            <div class="site-preview">
              ${screenshot ? `<img src="${escapeHtml(screenshot)}" alt="Captura de ${escapeHtml(lead.empresa)}">` : `<div class="preview-placeholder">${site ? 'Prévia não capturada (Modo Econômico).' : 'Empresa sem website registrado.'}</div>`}
            </div>
          </section>

          <section class="panel">
            <div class="panel-top">
              <h3>Instagram</h3>
              ${instagram ? `<a href="${escapeHtml(instagram)}" target="_blank" rel="noopener">Abrir Perfil ↗</a>` : ''}
            </div>
            <div class="instagram-card">
              <div class="instagram-profile">
                <span class="instagram-avatar">${photo ? `<img src="${escapeHtml(photo)}" alt="Foto">` : escapeHtml(initials(lead.empresa))}</span>
                <div>
                  <strong>${escapeHtml(lead.instagram || 'Não localizado')}</strong>
                  <span>${escapeHtml(ig.bioClarity ? `Bio ${ig.bioClarity}` : 'Sem dados')}</span>
                </div>
              </div>
              <p style="margin-top: 10px; font-size: 13px; color: #cbd5e1;">${escapeHtml(lead.instagram_analysis || 'Sem análise adicional do Instagram.')}</p>
            </div>
          </section>
        </div>

        <section class="analysis-card" style="margin-top: 10px;">
          <h3>Oportunidades Comerciais Identificadas</h3>
          <ul style="margin: 8px 0 0; padding-left: 20px; line-height: 1.6; color: #cbd5e1;">
            ${problemItems || '<li>Nenhuma oportunidade crítica detectada.</li>'}
          </ul>
        </section>

        <section class="message-card" style="margin-top: 14px;">
          <div class="message-label">
            <strong>Abordagem Personalizada (${escapeHtml(lead.canal_recomendado || 'WhatsApp/E-mail')})</strong>
            <button class="button ghost" data-action="copy-message" data-id="${escapeHtml(lead.id)}">Copiar Mensagem</button>
          </div>
          <textarea class="message-textarea" id="message-text-${escapeHtml(lead.id)}">${escapeHtml(lead.mensagem_personalizada || 'Mensagem em processamento.')}</textarea>
        </section>
      </div>
    </div>
  `;
}

function openLead(id) {
  const lead = state.leads.find((item) => item.id === id) || state.favorites.find((item) => item.id === id);
  if (!lead) return;
  $('#lead-detail').innerHTML = detailHtml(lead);
  $('#lead-dialog').showModal();
}

async function copyMessage(id) {
  const textarea = $(`#message-text-${id}`);
  const text = textarea ? textarea.value : '';
  if (!text) return;
  await navigator.clipboard.writeText(text);
  toast('Mensagem copiada para a área de transferência!');
}

async function toggleFavorite(id) {
  const current = state.leads.find((l) => l.id === id) || state.favorites.find((l) => l.id === id);
  if (!current) return;
  const updated = await api(`/api/leads/${id}/favorite`, {
    method: 'PATCH',
    body: JSON.stringify({ favorite: !current.favorite })
  });
  await loadData();
  if ($('#lead-dialog').open) $('#lead-detail').innerHTML = detailHtml(updated);
  toast(updated.favorite ? 'Empresa favoritada!' : 'Removida dos favoritos.');
}

async function archiveCurrentLeads() {
  if (state.leads.length === 0 || state.activeJob) return;
  const result = await api('/api/leads/archive', { method: 'POST' });
  await loadData();
  toast(`${result.count} leads arquivados no SQLite local!`);
}

async function restoreArchive(id) {
  const result = await api(`/api/archives/${id}/restore`, { method: 'POST' });
  await loadData();
  $('#archive-dialog').close();
  toast(`${result.restored} leads restaurados para o Dashboard!`);
}

async function submitForm(form, endpoint, errorElement) {
  const data = Object.fromEntries(new FormData(form));
  data.demo = data.demo === 'on';
  errorElement.classList.add('hidden');
  try {
    const job = await api(endpoint, { method: 'POST', body: JSON.stringify(data) });
    form.closest('dialog').close();
    form.reset();
    showJob(job);
    pollJob(job.id);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.remove('hidden');
  }
}

// EVENT LISTENERS GLOBAIS
document.addEventListener('click', async (event) => {
  const actionElement = event.target.closest('[data-action]');
  const viewElement = event.target.closest('[data-view]');
  const closeElement = event.target.closest('[data-close]');

  if (closeElement) {
    document.getElementById(closeElement.dataset.close)?.close();
  }

  if (viewElement) {
    switchView(viewElement.dataset.view);
  }

  if (actionElement) {
    const action = actionElement.dataset.action;
    try {
      if (action === 'open-search') $('#search-dialog').showModal();
      if (action === 'open-manual') $('#manual-dialog').showModal();
      if (action === 'open-archives') {
        renderArchives();
        $('#archive-dialog').showModal();
      }
      if (action === 'open-auth') {
        const sync = state.syncStatus;
        if (sync?.isAuthenticated) {
          $('#auth-logged-view').classList.remove('hidden');
          $('#auth-login-view').classList.add('hidden');
          $('#auth-current-email').textContent = sync.userEmail;
          $('#auth-current-team').textContent = sync.teamName ? sync.teamName : 'Nenhuma equipe (acesse a aba Equipe)';
        } else {
          $('#auth-logged-view').classList.add('hidden');
          $('#auth-login-view').classList.remove('hidden');
        }
        $('#auth-dialog').showModal();
      }
      if (action === 'toggle-favorite-filter') {
        state.onlyFavorites = !state.onlyFavorites;
        renderLeads();
      }
      if (action === 'toggle-favorite') await toggleFavorite(actionElement.dataset.id);
      if (action === 'archive-current') await archiveCurrentLeads();
      if (action === 'restore-archive') await restoreArchive(actionElement.dataset.id);
      if (action === 'view') openLead(actionElement.closest('.lead-row').dataset.id);
      if (action === 'copy-message') await copyMessage(actionElement.dataset.id);
      if (action === 'reanalyze') {
        const job = await api(`/api/leads/${actionElement.dataset.id}/reanalyze`, {
          method: 'POST',
          body: JSON.stringify({ auditMode: 'completo' })
        });
        $('#lead-dialog').close();
        showJob(job);
        pollJob(job.id);
      }
    } catch (err) {
      toast(err.message);
    }
  }
});

// SUBMIT DE FORMULÁRIOS
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitForm(e.currentTarget, '/api/discover', $('#search-error'));
});

$('#manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitForm(e.currentTarget, '/api/leads', $('#manual-error'));
});

let authMode = 'login';

$$('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.auth-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    authMode = tab.dataset.authTab;

    const registerFields = $('#auth-register-fields');
    const submitBtn = $('#auth-submit-btn');
    const dialogTitle = $('#auth-dialog-title');

    if (authMode === 'register') {
      registerFields.classList.remove('hidden');
      submitBtn.textContent = 'Criar Conta';
      dialogTitle.textContent = 'Criar Nova Conta';
    } else {
      registerFields.classList.add('hidden');
      submitBtn.textContent = 'Entrar';
      dialogTitle.textContent = 'Entrar na Conta';
    }
  });
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.rememberMe = $('#auth-remember') ? $('#auth-remember').checked : true;
  const errEl = $('#auth-error');
  errEl.classList.add('hidden');

  const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';

  try {
    const res = await api(endpoint, { method: 'POST', body: JSON.stringify(data) });
    form.closest('dialog').close();
    toast(res.message || (authMode === 'register' ? 'Conta criada com sucesso!' : 'Conectado à equipe com sucesso!'));
    await pollMetrics();
    await loadData();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

$('#btn-logout')?.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  $('#auth-dialog').close();
  toast('Desconectado da equipe.');
  await pollMetrics();
});

$('#btn-force-sync')?.addEventListener('click', async () => {
  await api('/api/sync/trigger', { method: 'POST' });
  toast('Sincronização iniciada.');
  await pollMetrics();
});

$('#lead-search')?.addEventListener('input', renderLeads);
$('#score-filter')?.addEventListener('change', renderLeads);

// INICIALIZAÇÃO
async function init() {
  const ready = await waitForBackend();
  if (!ready) {
    const configStatus = $('#config-status');
    if (configStatus) {
      configStatus.innerHTML = '<span class="config-row"><em>Motor Local</em><b style="color:var(--amber)">Aguardando backend...</b></span>';
    }
    toast('O motor local do RadarXL está iniciando. Aguarde alguns instantes...');
    return;
  }

  try {
    state.config = await api('/api/config');
    const items = [
      ['Motor Local', 'Ativo'],
      ['OpenStreetMap', 'Ativo'],
      ['Banco SQLite', 'Conectado'],
      ['Modo Auditoria', state.config.auditMode || 'Econômico']
    ];
    $('#config-status').innerHTML = items.map(([k, v]) => `
      <span class="config-row"><em>${k}</em><b class="ok">${v}</b></span>
    `).join('');

    await loadData();
    await pollMetrics();

    // Telemetria a cada 4 segundos
    state.metricsTimer = setInterval(pollMetrics, 4000);

    // Verificar se há job rodando
    const jobs = await api('/api/jobs');
    const running = jobs.find((j) => j.status === 'executando');
    if (running) pollJob(running.id);

  } catch (err) {
    console.warn('Erro ao inicializar dados:', err);
    toast(`Falha na inicialização: ${err.message}`);
  }
}

init();
