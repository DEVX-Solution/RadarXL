import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, normalizePhone } from '../src/utils/text.js';
import { createLeadIdentitySet, isKnownLead, leadIdentityKeys } from '../src/utils/lead-identity.js';

test('Deduplicação: normalização de domínios idênticos em formatos distintos', () => {
  const d1 = normalizeDomain('https://www.clinicaexemplo.com.br/contato');
  const d2 = normalizeDomain('http://clinicaexemplo.com.br');
  const d3 = normalizeDomain('clinicaexemplo.com.br/');
  assert.equal(d1, 'clinicaexemplo.com.br');
  assert.equal(d2, 'clinicaexemplo.com.br');
  assert.equal(d3, 'clinicaexemplo.com.br');
});

test('Deduplicação: normalização de telefones celulares e fixos com DDI', () => {
  const p1 = normalizePhone('(11) 98765-4321');
  const p2 = normalizePhone('+55 11 98765-4321');
  const p3 = normalizePhone('5511987654321');
  assert.equal(p1, '+5511987654321');
  assert.equal(p2, '+5511987654321');
  assert.equal(p3, '+5511987654321');
});

test('Deduplicação: identifica mesma empresa encontrada por operadores diferentes', () => {
  const leadA = {
    id: 'lead_a',
    empresa: 'Padaria Central',
    cidade: 'Campinas',
    site: 'https://padariacentral.com.br',
    contato: { telefone: '(19) 3232-1111' },
    googlePlaceId: 'ChIJ12345'
  };

  const leadB = {
    id: 'lead_b',
    empresa: 'Padaria Central LTDA',
    cidade: 'Campinas',
    site: 'http://www.padariacentral.com.br',
    contato: { telefone: '1932321111' },
    googlePlaceId: 'ChIJ12345'
  };

  const knownSet = createLeadIdentitySet([leadA]);
  assert.equal(isKnownLead(leadB, knownSet), true);
});
