# Modelagem de Dados & Armazenamento

O RadarXL 2.0 utiliza uma arquitetura híbrida de armazenamento composta por um banco local em SQLite e um banco compartilhado no PostgreSQL (Supabase).

---

## 1. Banco Local SQLite (`data/radarxl.db`)

O banco SQLite é criado automaticamente na inicialização da aplicação e é o responsável pelo funcionamento offline-first e pela resposta imediata da interface.

### Tabelas Locais:

1. **`local_leads`**
   - Armazena todas as empresas descobertas localmente e sincronizadas da nuvem.
   - Campos: `id`, `empresa`, `categoria`, `cidade`, `estado`, `site`, `instagram`, `instagram_url`, `email`, `telefone`, `status`, `score`, `favorite`, `fonte`, `google_place_id`, `osm_id`, `maps_url`, `screenshot_path`, `auditoria_json`, `website_data_json`, `instagram_details_json`, `problemas_json`, `analise_ia`, `mensagem_personalizada`, `canal_recomendado`, `ai_provider`, `created_at`, `updated_at`, `synced_at`.
   - Índices em: `favorite`, `score`, `cidade`, `categoria`, `google_place_id`, `osm_id`.

2. **`local_searches`**
   - Registra as buscas realizadas (locais e de colegas da equipe).
   - Campos: `id`, `categoria`, `cidade`, `estado`, `limite`, `status`, `progress_percent`, `completed_count`, `desired_count`, `scanned_count`, `discarded_count`, `repeated_count`, `error_message`, `created_by_name`, `created_by_id`, `team_id`, `created_at`, `updated_at`, `synced_at`.

3. **`local_search_leads`**
   - Tabela associativa relacionando pesquisas a leads (relação N:N).
   - Chave composta: `(search_id, lead_id)`.

4. **`local_archives`**
   - Lotes históricos arquivados pelo operador.
   - Campos: `id`, `label`, `count`, `leads_json`, `created_at`.

5. **`sync_queue`**
   - Fila transacional de sincronização com o Supabase.
   - Campos: `id`, `entity_type` ('lead', 'search', 'favorite'), `entity_id`, `operation` ('UPSERT', 'DELETE'), `payload_json`, `status` ('pending', 'syncing', 'synced', 'failed'), `attempts`, `last_error`, `created_at`, `updated_at`.
   - Índice em `(status, created_at)`.

---

## 2. Banco Compartilhado PostgreSQL (Supabase)

O PostgreSQL hospeda o schema compartilhado da equipe, garantindo integridade e isolamento através de RLS.

### Tabelas Remotas:
- `teams`: Dados da organização.
- `profiles`: Perfil dos colaboradores (estendendo `auth.users`).
- `team_members`: Associação e permissões de membros (`admin` ou `member`).
- `invitations`: Convites de novos funcionários com tokens temporários.
- `searches`: Pesquisas da equipe com status em tempo real.
- `leads`: Empresas cadastradas e deduplicadas.
- `search_leads`: Relação entre pesquisas e leads.
- `lead_activities`: Log de auditoria e ações comerciais.
- `audit_results`: Histórico detalhado de performance e SEO.
- `app_settings`: Configurações compartilhadas da equipe.

### Regra de Deduplicação Atômica (`upsert_team_lead`):
A função SQL `upsert_team_lead` no PostgreSQL avalia de forma estrita e em cascata:
1. `google_place_id` idêntico na mesma equipe.
2. `osm_id` idêntico na mesma equipe.
3. `site_domain` normalizado idêntico (ex: `site.com.br`).
4. `telefone_normalizado` em formato E.164 idêntico.
5. Nome da empresa + Cidade (case-insensitive) como fallback.

Se uma correspondência for encontrada, os novos dados são consolidados sem sobrescrever informações preexistentes de maior qualidade.
