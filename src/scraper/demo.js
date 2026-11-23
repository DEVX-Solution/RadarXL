export function discoverDemoLeads(query) {
  const base = [
    ['Clínica Horizonte Demo', 'Clínica odontológica', '@clinicahorizontedemo'],
    ['Imóveis Aurora Demo', 'Imobiliária', '@imoveisaurorademo'],
    ['Studio Forma Demo', 'Academia', '@studioformademo']
  ];
  return base.slice(0, Math.min(Number(query.limite) || 3, 3)).map(([empresa, categoria, instagram]) => ({
    empresa,
    categoria: query.categoria || categoria,
    cidade: query.cidade || 'Campinas',
    estado: query.estado || 'SP',
    endereco: 'Lead fictício para demonstração',
    site: '',
    instagram,
    instagram_url: `https://www.instagram.com/${instagram.slice(1)}/`,
    google_maps_url: '',
    contato: { email: '', telefone: '' },
    auditoria: { performance: 0, seo: 0, acessibilidade: 0, ssl: false, mobile_friendly: false },
    instagram_analysis: '',
    score: 0,
    problemas: [],
    analise_ia: '',
    mensagem_personalizada: '',
    screenshot_path: '',
    status: 'descoberto',
    fonte: 'Demonstração',
    demo: true
  }));
}
