import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { fetchJson } from '../utils/http.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { cleanText, normalizeInstagram, normalizePhone } from '../utils/text.js';
import { logger } from '../utils/logger.js';
import { hasDigitalPresence } from '../utils/lead-eligibility.js';

const nominatimLimiter = new RateLimiter({ minTime: 1100, concurrency: 1 });
const overpassLimiter = new RateLimiter({ minTime: 1200, concurrency: 1 });
const cacheFile = path.join(config.dataDir, 'geocode-cache.json');

const categoryGroups = [
  { aliases: ['dentista', 'odontologia', 'odontologica', 'odontologico'], label: 'Dentista', filters: [['healthcare', 'dentist'], ['amenity', 'dentist']] },
  { aliases: ['clinica', 'consultorio'], label: 'Clínica', filters: [['amenity', 'clinic'], ['healthcare', 'clinic']] },
  { aliases: ['medico', 'medica'], label: 'Médico', filters: [['healthcare', 'doctor'], ['amenity', 'doctors']] },
  { aliases: ['psicologo', 'psicologa', 'psicologia'], label: 'Psicologia', filters: [['healthcare', 'psychotherapist'], ['healthcare', 'psychologist']] },
  { aliases: ['fisioterapia', 'fisioterapeuta'], label: 'Fisioterapia', filters: [['healthcare', 'physiotherapist']] },
  { aliases: ['veterinario', 'veterinaria'], label: 'Veterinária', filters: [['amenity', 'veterinary']] },
  { aliases: ['farmacia', 'drogaria'], label: 'Farmácia', filters: [['amenity', 'pharmacy']] },
  { aliases: ['imobiliaria', 'corretor de imoveis'], label: 'Imobiliária', filters: [['office', 'estate_agent']] },
  { aliases: ['advogado', 'advocacia', 'escritorio de advocacia'], label: 'Advocacia', filters: [['office', 'lawyer']] },
  { aliases: ['contador', 'contabilidade'], label: 'Contabilidade', filters: [['office', 'accountant']] },
  { aliases: ['arquiteto', 'arquitetura'], label: 'Arquitetura', filters: [['office', 'architect']] },
  { aliases: ['marketing', 'agencia de marketing', 'publicidade'], label: 'Agência de marketing', filters: [['office', 'advertising_agency']] },
  { aliases: ['restaurante'], label: 'Restaurante', filters: [['amenity', 'restaurant']] },
  { aliases: ['pizzaria'], label: 'Pizzaria', filters: [['cuisine', 'pizza']] },
  { aliases: ['lanchonete', 'fast food'], label: 'Lanchonete', filters: [['amenity', 'fast_food']] },
  { aliases: ['cafeteria', 'cafe'], label: 'Cafeteria', filters: [['amenity', 'cafe']] },
  { aliases: ['padaria'], label: 'Padaria', filters: [['shop', 'bakery']] },
  { aliases: ['bar'], label: 'Bar', filters: [['amenity', 'bar'], ['amenity', 'pub']] },
  { aliases: ['academia', 'fitness'], label: 'Academia', filters: [['leisure', 'fitness_centre'], ['leisure', 'fitness_station']] },
  { aliases: ['salao de beleza', 'cabeleireiro', 'barbearia'], label: 'Salão de beleza', filters: [['shop', 'hairdresser'], ['shop', 'beauty']] },
  { aliases: ['oficina', 'oficina mecanica', 'mecanica'], label: 'Oficina mecânica', filters: [['shop', 'car_repair']] },
  { aliases: ['concessionaria', 'loja de carros'], label: 'Concessionária', filters: [['shop', 'car']] },
  { aliases: ['hotel', 'pousada'], label: 'Hotel', filters: [['tourism', 'hotel'], ['tourism', 'guest_house']] },
  { aliases: ['escola', 'colegio'], label: 'Escola', filters: [['amenity', 'school']] },
  { aliases: ['creche', 'educacao infantil'], label: 'Creche', filters: [['amenity', 'kindergarten']] },
  { aliases: ['pet shop', 'petshop'], label: 'Pet shop', filters: [['shop', 'pet']] },
  { aliases: ['loja de roupas', 'moda'], label: 'Loja de roupas', filters: [['shop', 'clothes'], ['shop', 'fashion']] },
  { aliases: ['supermercado', 'mercado'], label: 'Supermercado', filters: [['shop', 'supermarket'], ['shop', 'convenience']] },
  { aliases: ['moveis', 'loja de moveis'], label: 'Loja de móveis', filters: [['shop', 'furniture']] },
  { aliases: ['material de construcao'], label: 'Material de construção', filters: [['shop', 'building_materials']] },
  { aliases: ['agencia de viagens', 'turismo'], label: 'Agência de viagens', filters: [['office', 'travel_agent'], ['shop', 'travel_agency']] },
  { aliases: ['seguradora', 'seguros'], label: 'Seguros', filters: [['office', 'insurance']] }
];

function normalizeTerm(value = '') {
  return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function categoryDefinition(category) {
  const term = normalizeTerm(category);
  return categoryGroups.find((group) => group.aliases.some((alias) => term.includes(alias))) || null;
}

async function readCache() {
  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
}

function requestHeaders() {
  const contact = config.osmContactEmail ? `; contact: ${config.osmContactEmail}` : '';
  return {
    'User-Agent': `RadarDeLeadsBR/1.0 (local Node.js application${contact})`,
    'Accept-Language': 'pt-BR,pt;q=0.9'
  };
}

async function geocodeCity(query) {
  const key = normalizeTerm(`${query.cidade}-${query.estado || ''}-brasil`);
  const cache = await readCache();
  if (cache[key]?.cacheVersion === 2) return cache[key];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', `${query.cidade}${query.estado ? `, ${query.estado}` : ''}, Brasil`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('limit', '3');
  if (config.osmContactEmail) url.searchParams.set('email', config.osmContactEmail);

  const results = await nominatimLimiter.schedule(() => fetchJson(url, {
    headers: requestHeaders(),
    retries: 1
  }));
  const place = results.find((item) => item.address?.country_code === 'br') || results[0];
  if (!place) throw new Error(`Não foi possível localizar ${query.cidade} no OpenStreetMap.`);

  const [south, north, west, east] = place.boundingbox.map(Number);
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  const maxSpan = 1.2;
  const location = {
    cacheVersion: 2,
    displayName: place.display_name,
    latitude,
    longitude,
    bbox: [
      Math.max(south, latitude - maxSpan / 2),
      Math.max(west, longitude - maxSpan / 2),
      Math.min(north, latitude + maxSpan / 2),
      Math.min(east, longitude + maxSpan / 2)
    ]
  };
  cache[key] = location;
  await writeCache(cache);
  return location;
}

function escapeOverpassRegex(value) {
  return normalizeTerm(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandedGeography(bbox, options) {
  const radius = Number(options.searchRadiusKm || 0);
  if (radius <= 0 || !Number.isFinite(options.latitude) || !Number.isFinite(options.longitude)) {
    return `(${bbox.join(',')})`;
  }
  const latitudeDelta = radius / 111;
  const longitudeDelta = radius / (111 * Math.cos(options.latitude * Math.PI / 180));
  return `(${[
    options.latitude - latitudeDelta,
    options.longitude - longitudeDelta,
    options.latitude + latitudeDelta,
    options.longitude + longitudeDelta
  ].map((value) => value.toFixed(5)).join(',')})`;
}

export function buildQuery(category, bbox, limit, options = {}) {
  const definition = categoryDefinition(category);
  const geography = expandedGeography(bbox, options);
  const presenceFilter = options.requireWebsite
    ? '[~"^(contact:website|website|url)$"~"."]'
    : '[~"^(contact:website|website|url|contact:instagram|instagram)$"~"."]';
  let selectors;
  if (definition) {
    selectors = definition.filters.map(([key, value]) => (
      `nwr["${key}"="${value}"]["name"]${presenceFilter}${geography};`
    ));
  } else {
    const term = escapeOverpassRegex(category);
    selectors = [
      `nwr["name"~"${term}",i]${presenceFilter}${geography};`,
      `nwr["description"~"${term}",i]["name"]${presenceFilter}${geography};`
    ];
  }
  return {
    definition,
    query: `[out:json][timeout:35];(${selectors.join('')});out center ${Math.min(Math.max(limit * 6, 120), 500)};`
  };
}

async function queryOverpass(query) {
  let lastError;
  for (const endpoint of config.overpassEndpoints) {
    try {
      return await overpassLimiter.schedule(() => fetchJson(endpoint, {
        method: 'POST',
        headers: {
          ...requestHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({ data: query }),
        timeoutMs: 50_000,
        retries: 0
      }));
    } catch (error) {
      lastError = error;
      logger.warn('Servidor Overpass indisponível; tentando alternativa', { endpoint, error });
    }
  }
  throw lastError || new Error('Nenhum servidor Overpass está disponível no momento.');
}

function tagValue(tags, ...keys) {
  for (const key of keys) if (cleanText(tags[key])) return cleanText(tags[key]);
  return '';
}

function normalizeExternalUrl(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return '';
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(cleaned)) return `https://${cleaned}`;
  return '';
}

function instagramFromTag(value) {
  const normalized = normalizeInstagram(value);
  if (normalized.handle) return normalized;
  const handle = cleanText(value).replace(/^@/, '');
  if (/^[a-z0-9._]+$/i.test(handle)) {
    return { handle: `@${handle.toLowerCase()}`, url: `https://www.instagram.com/${handle.toLowerCase()}/` };
  }
  return { handle: '', url: '' };
}

function addressFrom(tags, query) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
  return cleanText([street, tags['addr:suburb'], tags['addr:city'] || query.cidade, tags['addr:state'] || query.estado].filter(Boolean).join(' - '));
}

function mapElement(element, query, definition) {
  const tags = element.tags || {};
  const website = normalizeExternalUrl(tagValue(tags, 'contact:website', 'website', 'url'));
  const instagramRaw = tagValue(tags, 'contact:instagram', 'instagram');
  const instagram = instagramFromTag(instagramRaw);
  const phoneRaw = tagValue(tags, 'contact:whatsapp', 'whatsapp', 'contact:phone', 'phone', 'mobile').split(/[;/]/)[0];
  const phone = normalizePhone(phoneRaw);
  return {
    osmId: `${element.type}/${element.id}`,
    empresa: cleanText(tags.name || tags.brand),
    categoria: definition?.label || cleanText(query.categoria),
    cidade: cleanText(tags['addr:city'] || query.cidade),
    estado: cleanText(tags['addr:state'] || query.estado),
    endereco: addressFrom(tags, query),
    site: website,
    instagram: instagram.handle,
    instagram_url: instagram.url,
    maps_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    google_maps_url: '',
    contato: {
      email: tagValue(tags, 'contact:email', 'email'),
      telefone: phone
    },
    auditoria: { performance: 0, seo: 0, acessibilidade: 0, ssl: false, mobile_friendly: false },
    instagram_analysis: '',
    score: 0,
    problemas: [],
    analise_ia: '',
    mensagem_personalizada: '',
    screenshot_path: '',
    status: 'descoberto',
    fonte: 'OpenStreetMap',
    sourceLicense: '© OpenStreetMap contributors, ODbL 1.0'
  };
}

export async function discoverOpenStreetMap(query) {
  const requestedLimit = Number(query.candidateLimit || query.limite) || 10;
  const limit = Math.min(requestedLimit, Math.max(config.maxLeadsPerSearch * config.candidateMultiplier, 30), 80);
  const location = await geocodeCity(query);
  const built = buildQuery(query.categoria, location.bbox, limit, {
    requireWebsite: query.requireWebsite,
    searchRadiusKm: query.searchRadiusKm,
    latitude: location.latitude,
    longitude: location.longitude
  });
  const data = await queryOverpass(built.query);
  const seen = new Set();
  return (data.elements || [])
    .map((element) => mapElement(element, query, built.definition))
    .filter((lead) => lead.empresa)
    .filter((lead) => query.requireWebsite ? Boolean(lead.site) : hasDigitalPresence(lead))
    .filter((lead) => {
      const key = normalizeTerm(`${lead.empresa}-${lead.endereco}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const contactsA = Number(Boolean(a.site)) + Number(Boolean(a.contato.telefone)) + Number(Boolean(a.instagram));
      const contactsB = Number(Boolean(b.site)) + Number(Boolean(b.contato.telefone)) + Number(Boolean(b.instagram));
      return contactsB - contactsA;
    })
    .slice(0, limit);
}
