import { clamp } from '../utils/text.js';

export function calculateLeadScore(lead) {
  const audit = lead.auditoria || {};
  const website = lead.websiteData || {};
  const instagram = lead.instagramDetails || {};
  const reasons = [];
  let score = 0;

  if (!lead.site || website.outdated) {
    score += 20;
    reasons.push(!lead.site ? 'Não foi localizado um site próprio.' : 'O site apresenta sinais de tecnologia ou estrutura visual antiga.');
  }
  if (!audit.ssl) {
    score += 20;
    reasons.push(lead.site ? 'O site não utiliza HTTPS corretamente.' : 'Não há site com HTTPS para transmitir confiança.');
  }
  if ((audit.seo ?? 0) < 60) {
    score += 20;
    reasons.push(`SEO técnico abaixo do ideal (${audit.seo ?? 0}/100).`);
  }
  if ((audit.performance ?? 0) < 60) {
    score += 20;
    reasons.push(`Performance abaixo do ideal (${audit.performance ?? 0}/100).`);
  }
  if (!lead.site || website.outdated || audit.broken_layout) {
    score += 20;
    reasons.push(audit.broken_layout ? 'Foram detectados sinais de layout quebrado em telas menores.' : 'Há oportunidade clara de modernizar a experiência digital.');
  }
  if (!lead.instagram || instagram.weak) {
    score += 10;
    reasons.push(!lead.instagram ? 'Instagram oficial não localizado.' : 'O Instagram apresenta sinais de perfil fraco ou pouco ativo.');
  }
  if (!lead.site || !lead.instagram || (!website.hasAnalytics && !website.hasSchema)) {
    score += 10;
    reasons.push('A presença digital tem poucos sinais de estrutura para aquisição de clientes.');
  }

  return { score: clamp(score, 0, 100), problems: [...new Set(reasons)] };
}
