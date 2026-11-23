import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLeadScore } from '../src/scoring/lead-score.js';

test('Lead Scoring: empresa sem website próprio recebe oportunidade alta de presença digital', () => {
  const lead = {
    empresa: 'Boutique da Moda',
    site: '',
    instagram: '@boutiquemoda',
    instagramDetails: { followers: 500, qualityScore: 40 },
    auditoria: { performance: 0, seo: 0, ssl: false }
  };

  const { score, problems } = calculateLeadScore(lead);
  assert.ok(score >= 40, `Esperado score >= 40, recebido: ${score}`);
  assert.ok(problems.some((p) => /site/i.test(p)), 'Deve listar oportunidade referente a website');
});

test('Lead Scoring: site com baixa performance gera oportunidade técnica', () => {
  const lead = {
    empresa: 'Restaurante Sabor',
    site: 'https://restaurantesabor.com.br',
    instagram: '@restaurantesabor',
    instagramDetails: { followers: 2000, qualityScore: 70 },
    auditoria: { performance: 25, seo: 40, ssl: true, mobile_friendly: false }
  };

  const { score, problems } = calculateLeadScore(lead);
  assert.ok(score > 30, `Score calculado: ${score}`);
  assert.ok(problems.length > 0, 'Deve conter lista de problemas técnicos');
});
