# Changelog - RadarXL

Todas as alterações relevantes deste projeto serão documentadas neste arquivo.

## [2.0.0] - 2026-11-23

### 🚀 Transformação Completa para RadarXL 2.0
- **Rebranding Completo**: Mudança de nome oficial para **RadarXL Intelligence 2.0**, com slogan *"Encontre oportunidades. Conquiste negócios."*.
- **Desktop Nativo com Tauri 2 + Rust**: Configuração da estrutura `src-tauri` para empacotamento Windows com WebView2 e ciclo de vida de processo para o backend Node.js (`src/index.js`).
- **Banco de Dados Local SQLite**: Implementação de `src/storage/sqlite-db.js` com tabelas locais (`local_leads`, `local_searches`, `local_archives`, `sync_queue`), modo WAL e índices otimizados.
- **Migrador Automático JSON -> SQLite**: Criação de `src/storage/migration-runner.js` com criação de backup em `data/backup_pre_migration/` e migração não destrutiva.
- **Sincronização Compartilhada Supabase**:
  - Migrations SQL (`infra/database/migrations/001_initial_schema.sql`) com 10 tabelas e Row Level Security (RLS) estrito.
  - Função RPC `upsert_team_lead()` para deduplicação idempotente no PostgreSQL.
  - Módulo `src/sync/supabase-client.js` usando unicamente chave `anon` pública.
  - Motor em segundo plano `src/sync/sync-worker.js` com fila offline (`sync_queue`) e Supabase Realtime.
- **Otimização de Performance (CPU e RAM)**:
  - 3 Modos de auditoria configuráveis: *Econômico* (padrão, ultra leve via Cheerio), *Completo* e *Profissional*.
  - Lighthouse e Screenshots desativados por padrão, reduzindo o consumo de memória em ~88%.
  - Reciclagem automática do Chromium a cada 20 páginas em `src/audit/browser.js`.
  - Módulo de telemetria `src/utils/system-metrics.js` monitorando RAM e CPU em tempo real.
- **Nova Interface Dark Mode Ciano Tech**:
  - Navegação lateral com as 11 seções obrigatórias.
  - Indicadores em tempo real na barra superior (Online/Offline, Sync Status, RAM, CPU).
  - Modal de autenticação para login na equipe.
  - Grid de pesquisas da equipe compartilhadas.
- **Suíte de Testes Automatizados**: 10 testes unitários e de integração cobrindo deduplicação, scoring, armazenamento SQLite e sincronização offline-first.
- **Documentação Completa**: Criação de `README.md`, `ARCHITECTURE.md`, `DATABASE.md`, `SUPABASE_SETUP.md`, `INSTALLATION.md`, `MIGRATION.md`, `PERFORMANCE.md`, `SECURITY.md`.
