import { config } from '../config.js';
import { discoverGooglePlaces } from '../scraper/google-places.js';
import { discoverOpenStreetMap } from '../scraper/openstreetmap.js';
import { discoverDemoLeads } from '../scraper/demo.js';
import { inspectWebsite } from '../scraper/website.js';
import { discoverInstagramProfile } from '../scraper/instagram-discovery.js';
import { analyzeInstagram } from '../instagram/profile-analyzer.js';
import { auditWebsite, createFallbackAudit } from '../audit/website-audit.js';
import { calculateLeadScore } from '../scoring/lead-score.js';
import { generateLeadAnalysis } from '../ai/lead-analysis.js';
import { logger } from '../utils/logger.js';
import { hasDigitalPresence, hasInstagramPresence } from '../utils/lead-eligibility.js';
import { createLeadIdentitySet, isKnownLead, rememberLead } from '../utils/lead-identity.js';

async function safely(operation, fallback, label, lead) {
  try {
    return await operation();
  } catch (error) {
    logger.warn(`${label} falhou`, { lead: lead.empresa, error });
    return typeof fallback === 'function' ? fallback(error) : fallback;
  }
}

function demoAnalysis(lead) {
  const withInstagram = Boolean(lead.instagram);
  return {
    websiteData: {
      reachable: false,
      outdated: true,
      hasAnalytics: false,
      hasSchema: false,
      ctaCount: 0,
      error: 'Dado simulado: site não localizado.'
    },
    auditoria: {
      performance: 0,
      seo: 0,
      acessibilidade: 0,
      ssl: false,
      mobile_friendly: false,
      broken_layout: false,
      load_time_ms: 0,
      error: 'Auditoria simulada para demonstração.'
    },
    instagramDetails: {
      found: withInstagram,
      followers: withInstagram ? 840 : null,
      activity: withInstagram ? 'pouco ativo' : 'ausente',
      bioClarity: withInstagram ? 'regular' : 'fraca',
      hasLink: false,
      weak: true,
      qualityScore: withInstagram ? 38 : 0,
      summary: withInstagram
        ? 'Perfil de demonstração com bio regular, sem link externo e sinais de pouca atividade.'
        : 'A empresa não possui um perfil oficial do Instagram localizado.'
    }
  };
}

export function shouldDiscardCandidate(lead, websiteData, skipUnreachable = config.skipUnreachableWebsites, requireWebsite = false) {
  if (!hasDigitalPresence(lead)) return true;
  if (requireWebsite && (!lead.site || websiteData?.reachable === false)) return true;
  return Boolean(
    skipUnreachable
    && lead.site
    && websiteData
    && !websiteData.reachable
    && !hasInstagramPresence(lead)
  );
}

export class LeadPipeline {
  constructor(store, archiveStore = null, dependencies = {}) {
    this.store = store;
    this.archiveStore = archiveStore;
    this.discoverGooglePlaces = dependencies.discoverGooglePlaces || discoverGooglePlaces;
    this.discoverOpenStreetMap = dependencies.discoverOpenStreetMap || discoverOpenStreetMap;
    this.inspectWebsite = dependencies.inspectWebsite || inspectWebsite;
  }

  async discover(query, onProgress = () => {}) {
    const demo = query.demo === true || config.demoMode;
    const requireWebsite = !demo;
    const desiredTotal = Math.min(Number(query.limite) || 10, config.maxLeadsPerSearch);
    const candidateLimit = demo
      ? desiredTotal
      : Math.min(
        Math.max(desiredTotal * config.candidateMultiplier, desiredTotal + 10),
        Math.max(config.maxLeadsPerSearch * config.candidateMultiplier, 40),
        160
      );
    const useGoogle = config.discoveryProvider === 'google' || (
      config.discoveryProvider === 'auto' && Boolean(config.googleMapsApiKey)
    );
    const history = [
      ...(typeof this.store.all === 'function' ? this.store.all() : []),
      ...(typeof this.archiveStore?.allLeads === 'function' ? this.archiveStore.allLeads() : [])
    ];
    const knownIdentities = createLeadIdentitySet(history);
    const candidatesSeenThisSearch = new Set();
    const searchRadii = demo || useGoogle ? [0] : [0, 20, 40, 70, 110];
    const results = [];
    let scanned = 0;
    let discarded = 0;
    let repeated = 0;

    for (const searchRadiusKm of searchRadii) {
      if (results.length >= desiredTotal) break;
      const leads = demo
        ? discoverDemoLeads(query)
        : useGoogle
          ? await this.discoverGooglePlaces({ ...query, candidateLimit, requireWebsite })
          : await this.discoverOpenStreetMap({
            ...query,
            candidateLimit,
            requireWebsite,
            searchRadiusKm
          });

      for (const discoveredLead of leads) {
        if (results.length >= desiredTotal) break;
        const lead = { ...discoveredLead };
        if (isKnownLead(lead, candidatesSeenThisSearch)) continue;
        rememberLead(lead, candidatesSeenThisSearch);
        scanned += 1;

        if (isKnownLead(lead, knownIdentities)) {
          repeated += 1;
          onProgress({
            phase: 'validating',
            completed: results.length,
            total: desiredTotal,
            current: `${lead.empresa} já apareceu antes; procurando outra empresa`,
            scanned,
            discarded,
            repeated
          });
          continue;
        }

        if (!hasDigitalPresence(lead) || (requireWebsite && !lead.site)) {
          discarded += 1;
          continue;
        }

        let websiteData;
        if (!demo && config.skipUnreachableWebsites && lead.site) {
          onProgress({
            phase: 'validating',
            completed: results.length,
            total: desiredTotal,
            current: `Validando o site de ${lead.empresa}`,
            scanned,
            discarded,
            repeated
          });
          websiteData = await safely(
            () => this.inspectWebsite(lead.site, {
              timeoutMs: config.websitePrecheckTimeoutMs,
              retries: 0
            }),
            (error) => ({ reachable: false, error: error.message }),
            'Validação preliminar do site',
            lead
          );
          if (shouldDiscardCandidate(lead, websiteData, config.skipUnreachableWebsites, requireWebsite)) {
            discarded += 1;
            continue;
          }
          if (websiteData.finalUrl) lead.site = websiteData.finalUrl;
          if (isKnownLead(lead, knownIdentities)) {
            repeated += 1;
            continue;
          }
        }

        const saved = await this.store.upsert({ ...lead, status: 'na_fila' });
        onProgress({
          phase: 'processing',
          completed: results.length,
          total: desiredTotal,
          current: saved.empresa,
          scanned,
          discarded,
          repeated
        });
        const result = await this.process(saved, {
          websiteData,
          lighthouseEnabled: query.lighthouseEnabled,
          screenshotEnabled: query.screenshotEnabled
        });
        if (!result || (requireWebsite && (!result.site || result.websiteData?.reachable === false))) {
          if (result?.id && typeof this.store.remove === 'function') await this.store.remove(result.id);
          discarded += 1;
          continue;
        }
        rememberLead(result, knownIdentities);
        results.push(result);
        onProgress({
          phase: 'processing',
          completed: results.length,
          total: desiredTotal,
          current: saved.empresa,
          scanned,
          discarded,
          repeated
        });
      }
    }

    onProgress({
      phase: 'completed',
      completed: results.length,
      total: desiredTotal,
      current: results.length < desiredTotal
        ? `${results.length} empresa(s) inédita(s) com site encontradas; a região ampliada não possui mais resultados públicos`
        : `${results.length} empresa(s) inédita(s) com site encontradas`,
      scanned,
      discarded,
      repeated
    });
    return results;
  }

  async discoverLegacy(query, onProgress = () => {}) {
    const demo = query.demo === true || config.demoMode;
    const desiredTotal = Math.min(Number(query.limite) || 10, config.maxLeadsPerSearch);
    const candidateLimit = demo
      ? desiredTotal
      : Math.min(
        Math.max(desiredTotal * config.candidateMultiplier, desiredTotal + 5),
        Math.max(config.maxLeadsPerSearch * config.candidateMultiplier, 30),
        80
      );
    const useGoogle = config.discoveryProvider === 'google' || (
      config.discoveryProvider === 'auto' && Boolean(config.googleMapsApiKey)
    );
    const leads = demo
      ? discoverDemoLeads(query)
      : useGoogle
        ? await this.discoverGooglePlaces({ ...query, candidateLimit })
        : await this.discoverOpenStreetMap({ ...query, candidateLimit });
    let scanned = 0;
    let discarded = 0;
    const results = [];

    for (const discoveredLead of leads) {
      if (results.length >= desiredTotal) break;
      const lead = { ...discoveredLead };
      scanned += 1;
      let websiteData;

      if (!hasDigitalPresence(lead)) {
        discarded += 1;
        logger.info('Candidato descartado porque não possui site nem Instagram', {
          lead: lead.empresa
        });
        onProgress({
          phase: 'validating',
          completed: results.length,
          total: desiredTotal,
          current: `${lead.empresa} descartada; procurando empresa com site ou Instagram`,
          scanned,
          discarded
        });
        continue;
      }

      if (!demo && config.skipUnreachableWebsites && lead.site) {
        onProgress({
          phase: 'validating',
          completed: results.length,
          total: desiredTotal,
          current: `Validando o site de ${lead.empresa}`,
          scanned,
          discarded
        });
        websiteData = await safely(
          () => this.inspectWebsite(lead.site, {
            timeoutMs: config.websitePrecheckTimeoutMs,
            retries: 0
          }),
          (error) => ({ reachable: false, error: error.message }),
          'Validação preliminar do site',
          lead
        );
        if (shouldDiscardCandidate(lead, websiteData)) {
          discarded += 1;
          logger.info('Candidato descartado porque o site informado não abre', {
            lead: lead.empresa,
            site: lead.site,
            reason: websiteData.error
          });
          onProgress({
            phase: 'validating',
            completed: results.length,
            total: desiredTotal,
            current: `${lead.empresa} descartada; procurando outra empresa`,
            scanned,
            discarded
          });
          continue;
        }
        if (!websiteData.reachable && hasInstagramPresence(lead)) {
          logger.info('Site inválido removido; candidato mantido pelo Instagram', {
            lead: lead.empresa,
            site: lead.site
          });
          lead.site = '';
        }
      }

      const saved = await this.store.upsert({ ...lead, status: 'na_fila' });
      onProgress({
        phase: 'processing',
        completed: results.length,
        total: desiredTotal,
        current: saved.empresa,
        scanned,
        discarded
      });
      const result = await this.process(saved, {
        websiteData,
        lighthouseEnabled: query.lighthouseEnabled,
        screenshotEnabled: query.screenshotEnabled
      });
      if (!result) {
        discarded += 1;
        continue;
      }
      results.push(result);
      onProgress({
        phase: 'processing',
        completed: results.length,
        total: desiredTotal,
        current: saved.empresa,
        scanned,
        discarded
      });
    }
    onProgress({
      phase: 'completed',
      completed: results.length,
      total: desiredTotal,
      current: results.length < desiredTotal
        ? `${results.length} empresa(s) válida(s) encontrada(s); não há mais candidatos disponíveis`
        : `${results.length} empresa(s) válida(s) encontrada(s)`,
      scanned,
      discarded
    });
    return results;
  }

  async process(inputLead, options = {}) {
    let lead = await this.store.upsert({ ...inputLead, status: 'analisando', processingError: '' });
    try {
      if (!hasDigitalPresence(lead)) {
        await this.store.remove(lead.id);
        logger.info('Lead removido porque não possui site nem Instagram', { lead: lead.empresa });
        return null;
      }
      if (lead.demo) {
        lead = { ...lead, ...demoAnalysis(lead) };
      } else {
        const websiteData = options.websiteData || await safely(
          () => this.inspectWebsite(lead.site),
          (error) => ({ reachable: false, error: error.message }),
          'Leitura do site',
          lead
        );
        lead.websiteData = websiteData;
        if (websiteData.finalUrl) lead.site = websiteData.finalUrl;
        if (lead.site && websiteData.reachable === false) lead.site = '';
        if (!lead.contato?.email && websiteData.email) lead.contato.email = websiteData.email;
        if (!lead.contato?.telefone && websiteData.phone) lead.contato.telefone = websiteData.phone;

        const profile = await safely(
          () => discoverInstagramProfile(lead),
          { handle: '', url: '' },
          'Descoberta do Instagram',
          lead
        );
        if (profile.handle) {
          lead.instagram = profile.handle;
          lead.instagram_url = profile.url;
        }
        if (!hasDigitalPresence(lead)) {
          await this.store.remove(lead.id);
          logger.info('Lead removido após análise por não possuir site válido nem Instagram', {
            lead: lead.empresa
          });
          return null;
        }
        lead.instagramDetails = await analyzeInstagram(lead.instagram_url);
        lead.auditoria = await safely(
          () => auditWebsite(lead, websiteData, {
            lighthouseEnabled: options.lighthouseEnabled,
            screenshotEnabled: options.screenshotEnabled
          }),
          (error) => createFallbackAudit(lead, websiteData, error),
          'Auditoria do site',
          lead
        );
      }

      lead.instagram_analysis = lead.instagramDetails.summary;
      lead.screenshot_path = lead.auditoria.screenshot_path || '';
      const scoring = calculateLeadScore(lead);
      lead.score = scoring.score;
      lead.problemas = scoring.problems;
      const generated = await generateLeadAnalysis(lead);
      lead.analise_ia = generated.analysis;
      lead.mensagem_personalizada = generated.message;
      lead.canal_recomendado = generated.channel;
      lead.ai_provider = generated.provider;
      lead.status = 'concluido';
      return this.store.upsert(lead);
    } catch (error) {
      logger.error('Falha não recuperável ao processar lead', { lead: lead.empresa, error });
      return this.store.upsert({ ...lead, status: 'erro', processingError: error.message });
    }
  }
}
