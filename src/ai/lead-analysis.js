import { config } from '../config.js';
import { fetchJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { cleanText } from '../utils/text.js';

function observationsFor(lead) {
  const observations = [];
  const audit = lead.auditoria || {};
  const instagram = lead.instagramDetails || {};
  const website = lead.websiteData || {};

  if (!lead.site) observations.push('não foi localizado um site próprio');
  else {
    if (audit.performance > 0 && audit.performance < 60) observations.push(`a performance do site ficou em ${audit.performance}/100`);
    if (audit.seo > 0 && audit.seo < 60) observations.push(`a auditoria de SEO ficou em ${audit.seo}/100`);
    if (!audit.mobile_friendly) observations.push('a experiência em telas de celular pode ser aprimorada');
    if (website.ctaCount === 0) observations.push('há espaço para deixar o próximo passo do visitante mais claro');
    if (website.outdated) observations.push('a estrutura visual apresenta oportunidades de modernização');
  }
  if (!lead.instagram) observations.push('não foi localizado um Instagram oficial conectado à presença digital');
  else {
    if (instagram.bioClarity === 'fraca' || instagram.bioClarity === 'regular') observations.push('a bio do Instagram pode comunicar melhor a proposta do negócio');
    if (instagram.hasLink === false) observations.push('o Instagram não apresenta um link externo identificável');
    if (instagram.activity === 'inativo' || instagram.activity === 'pouco ativo') observations.push(`o Instagram aparenta estar ${instagram.activity}`);
    if (instagram.qualityScore >= 70) observations.push('o Instagram já possui uma presença bem estruturada');
  }
  return observations.slice(0, 5);
}

function localFallback(lead) {
  const observations = observationsFor(lead);
  const primary = observations[0] || 'há oportunidades de fortalecer a presença digital';
  const secondary = observations[1];
  const channel = lead.contato?.telefone ? 'WhatsApp' : 'Instagram';
  const analysis = [
    `${lead.empresa} apresenta uma oportunidade comercial de ${lead.score >= 70 ? 'alta' : lead.score >= 40 ? 'média' : 'baixa'} prioridade.`,
    `Na análise, ${primary}${secondary ? ` e ${secondary}` : ''}.`,
    'A abordagem recomendada é consultiva, mostrando ganhos práticos de clareza, confiança e conversão sem desvalorizar o trabalho atual.'
  ].join(' ');
  const greeting = `Olá! Tudo bem? Encontrei a ${lead.empresa} enquanto analisava negócios de ${lead.cidade || 'sua região'}.`;
  const observationText = secondary
    ? ` Notei que ${primary} e que ${secondary}.`
    : ` Notei que ${primary}.`;
  const message = `${greeting}${observationText} Tenho algumas sugestões simples que podem ajudar a transformar melhor a presença online em novos contatos. Posso te enviar essas ideias sem compromisso?`;
  return { analysis, message: cleanText(message), channel, provider: 'fallback-local' };
}

function extractJson(content) {
  const cleaned = String(content).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('A IA não retornou JSON válido.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function promptFor(lead) {
  return {
    payload: {
    empresa: lead.empresa,
    categoria: lead.categoria,
    cidade: lead.cidade,
    auditoria: lead.auditoria,
    dados_site: lead.websiteData,
    instagram: lead.instagramDetails,
    score: lead.score,
    observacoes_verificadas: observationsFor(lead),
      canal_preferido: lead.contato?.telefone ? 'WhatsApp' : 'Instagram DM'
    },
    system: [
    'Você é um consultor brasileiro de presença digital e conversão para pequenos negócios.',
    'Responda somente em português do Brasil e em JSON válido.',
    'Nunca invente fatos. Use exclusivamente as observações verificadas fornecidas.',
    'A mensagem deve soar humana, cordial e consultiva, sem crítica direta, pressão, promessa ou linguagem de spam.',
    'Mencione uma ou duas observações reais, ofereça ideias gratuitas e termine com uma pergunta simples.',
    'Limite a mensagem a 550 caracteres e não use emojis.',
    'Formato: {"analise":"...", "mensagem":"...", "canal":"WhatsApp|Instagram"}'
    ].join(' ')
  };
}

function normalizeAiResult(parsed, lead, provider) {
  if (!parsed.analise || !parsed.mensagem) throw new Error('Resposta incompleta da IA.');
  return {
    analysis: cleanText(parsed.analise),
    message: cleanText(parsed.mensagem).slice(0, 650),
    channel: parsed.canal || (lead.contato?.telefone ? 'WhatsApp' : 'Instagram'),
    provider
  };
}

async function callAi(lead) {
  const { payload, system } = promptFor(lead);
  const data = await fetchJson(`${config.aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.aiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.aiModel,
      temperature: 0.45,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    })
  });
  const parsed = extractJson(data.choices?.[0]?.message?.content || '');
  return normalizeAiResult(parsed, lead, config.aiModel);
}

async function callOllama(lead) {
  const { payload, system } = promptFor(lead);
  const data = await fetchJson(`${config.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      format: 'json',
      options: { temperature: 0.45 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    }),
    timeoutMs: config.ollamaTimeoutMs,
    retries: 0
  });
  const parsed = extractJson(data.message?.content || '');
  return normalizeAiResult(parsed, lead, `Ollama/${config.ollamaModel}`);
}

export async function generateLeadAnalysis(lead) {
  if (config.aiApiKey) {
    try {
      return await callAi(lead);
    } catch (error) {
      logger.warn('API de IA indisponível; tentando alternativa local', { lead: lead.empresa, error });
    }
  }
  if (config.ollamaEnabled) {
    try {
      return await callOllama(lead);
    } catch (error) {
      logger.debug('Ollama não disponível; usando gerador interno', { lead: lead.empresa, error });
    }
  }
  return localFallback(lead);
}
