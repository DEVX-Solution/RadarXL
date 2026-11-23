# Segurança, Permissões e LGPD no RadarXL 2.0

## 1. Segurança de Rede e Processo Local

1. **Ligação Exclusiva em Localhost (`127.0.0.1`)**: O servidor backend Express rejeita qualquer escuta em `0.0.0.0`. A API não fica exposta para outros dispositivos da rede local Wi-Fi/Ethernet.
2. **Proteção de Token Local**: Opcionalmente controlado pela variável `LOCAL_API_SECRET` via header `Authorization: Bearer <token>` para proteger requisições do sidecar.
3. **Mitigação de SSRF (Server-Side Request Forgery)**: Validação de protocolos estritamente `http:` e `https:` antes de qualquer chamada Cheerio ou Puppeteer.

---

## 2. Isolamento de Dados na Nuvem (Row Level Security - RLS)

- **Zero Chaves `service_role`**: A chave mestra do Supabase nunca é embutida no aplicativo distribuído aos usuários.
- **Isolamento por Equipe (`team_id`)**: Todas as 10 tabelas do PostgreSQL possuem RLS ativado com políticas que verificam se o `auth.uid()` pertence à equipe do registro.
- **Idempotência**: Nenhuma operação de sincronização sobrescreve registros de outras organizações.

---

## 3. Conformidade com a LGPD (Lei Geral de Proteção de Dados - Lei 13.709/2018)

1. **Dados Estritamente Públicos e Comerciais**: O RadarXL coleta unicamente informações cadastrais públicas de pessoas jurídicas (B2B) disponibilizadas abertamente no OpenStreetMap, Google Maps e websites institucionais.
2. **Sem Disparo em Massa Não Autorizado**: O sistema não implementa spam ou disparos automáticos massivos de WhatsApp ou e-mails. As mensagens geradas pela IA são sugestões para que o operador humano revise e realize contato direto consultivo.
3. **Direito à Exclusão (Opt-Out)**: A rota `DELETE /api/leads/:id` permite remover definitivamente qualquer empresa da base local e da nuvem sincronizada a qualquer momento.
