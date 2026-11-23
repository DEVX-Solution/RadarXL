import { config } from '../config.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { fetchJson } from '../utils/http.js';
import { cleanText, normalizePhone } from '../utils/text.js';

const limiter = new RateLimiter({ minTime: config.discoveryDelayMs, concurrency: 1 });
const endpoint = 'https://places.googleapis.com/v1/places:searchText';
const fieldMask = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.primaryTypeDisplayName',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.businessStatus',
  'nextPageToken'
].join(',');

function mapPlace(place, query) {
  return {
    googlePlaceId: place.id,
    empresa: cleanText(place.displayName?.text),
    categoria: cleanText(place.primaryTypeDisplayName?.text || query.categoria),
    cidade: cleanText(query.cidade),
    estado: cleanText(query.estado),
    endereco: cleanText(place.formattedAddress),
    site: place.websiteUri || '',
    instagram: '',
    instagram_url: '',
    google_maps_url: place.googleMapsUri || '',
    contato: {
      email: '',
      telefone: normalizePhone(place.internationalPhoneNumber || place.nationalPhoneNumber)
    },
    auditoria: {
      performance: 0,
      seo: 0,
      acessibilidade: 0,
      ssl: false,
      mobile_friendly: false
    },
    instagram_analysis: '',
    score: 0,
    problemas: [],
    analise_ia: '',
    mensagem_personalizada: '',
    screenshot_path: '',
    status: 'descoberto',
    fonte: 'Google Maps',
    businessStatus: place.businessStatus || ''
  };
}

export async function discoverGooglePlaces(query) {
  if (!config.googleMapsApiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY não configurada. Use o modo demonstração ou adicione a chave no .env.');
  }

  const requestedLimit = Number(query.candidateLimit || query.limite) || 10;
  const limit = Math.min(requestedLimit, Math.max(config.maxLeadsPerSearch * config.candidateMultiplier, 20), 60);
  const textQuery = `${query.categoria} em ${query.cidade}${query.estado ? `, ${query.estado}` : ''}, Brasil`;
  const places = [];
  let pageToken;

  while (places.length < limit) {
    const body = {
      textQuery,
      languageCode: 'pt-BR',
      regionCode: 'BR',
      pageSize: Math.min(20, limit - places.length),
      includePureServiceAreaBusinesses: true,
      ...(pageToken ? { pageToken } : {})
    };
    const data = await limiter.schedule(() => fetchJson(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.googleMapsApiKey,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(body)
    }));
    places.push(...(data.places || []).filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY'));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return places.slice(0, limit).map((place) => mapPlace(place, query));
}
