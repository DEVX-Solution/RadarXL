function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function websiteHost(value = '') {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function leadIdentityKeys(lead = {}) {
  const keys = new Set();
  if (lead.osmId) keys.add(`osm:${lead.osmId}`);
  if (lead.googlePlaceId) keys.add(`google:${lead.googlePlaceId}`);
  const host = websiteHost(lead.site);
  if (host) keys.add(`site:${host}`);
  const instagram = normalize(lead.instagram || lead.instagram_url).replace(/\s+/g, '');
  if (instagram) keys.add(`instagram:${instagram}`);
  const company = normalize(lead.empresa);
  const city = normalize(lead.cidade);
  if (company) keys.add(`company:${company}:${city}`);
  return keys;
}

export function createLeadIdentitySet(leads = []) {
  const identities = new Set();
  for (const lead of leads) {
    for (const key of leadIdentityKeys(lead)) identities.add(key);
  }
  return identities;
}

export function isKnownLead(lead, identities) {
  return [...leadIdentityKeys(lead)].some((key) => identities.has(key));
}

export function rememberLead(lead, identities) {
  for (const key of leadIdentityKeys(lead)) identities.add(key);
}
