import crypto from 'node:crypto';

export function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return digits.length > 11 ? `+${digits}` : digits;
}

export function normalizeInstagram(value = '') {
  const match = String(value).match(/(?:instagram\.com\/|@)([A-Za-z0-9._]+)/i);
  if (!match) return { handle: '', url: '' };
  const handle = `@${match[1].toLowerCase()}`;
  return { handle, url: `https://www.instagram.com/${match[1].toLowerCase()}/` };
}

export function normalizeDomain(value = '') {
  if (!value) return '';
  try {
    const raw = String(value).trim().toLowerCase();
    const url = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw)
      : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return String(value).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
  }
}

export function normalizeText(value = '') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function slugify(value = '') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function createId(prefix = 'lead') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
