# Arquitetura Técnica do RadarXL 2.0

## 1. Visão Geral da Arquitetura

O **RadarXL 2.0** adota o modelo arquitetural **Local-First / Edge-Processing com Nuvem Compartilhada**. Todo o processamento pesado (raspagem web, auditoria com headless browser, análise de texto e cálculo de score) ocorre diretamente no hardware da estação de trabalho de cada operador. A nuvem (Supabase) atua exclusivamente como camada de transporte, autorização e banco de dados consolidado em tempo real, garantindo **custo zero com infraestrutura**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DESKTOP TAURI 2 (Rust)                          │
│         Janela Nativa Windows | WebView2 | Supervisor de Processos     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC Local Seguro (127.0.0.1)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    RADARXL LOCAL ENGINE (Node.js)                      │
│                                                                        │
│   ┌────────────────────┐   ┌───────────────────┐   ┌───────────────┐   │
│   │ Express 5 API Local│   │ SyncWorker        │   │ SystemMetrics │   │
│   │ (Porta 3000)       │   │ (Offline/Online)  │   │ (RAM/CPU)     │   │
│   └─────────┬──────────┘   └─────────┬─────────┘   └───────────────┘   │
│             │                        │                                 │
│             ▼                        ▼                                 │
│   ┌────────────────────────────────────────────┐                       │
│   │       SQLite Local DB (node:sqlite WAL)    │                       │
│   │  - local_leads (cache & indexação rápida)  │                       │
│   │  - local_searches (histórico e status)     │                       │
│   │  - sync_queue (fila offline com retry)     │                       │
│   └────────────────────────┬───────────────────┘                       │
└────────────────────────────┼───────────────────────────────────────────┘
                             │ Lotes Idempotentes via HTTPS
                             │ (RLS + Anon Key + JWT do Usuário)
┌────────────────────────────▼───────────────────────────────────────────┐
│                    SUPABASE SHARED CLOUD (PostgreSQL)                  │
│       - Auth (Login / Senha / Convites de Equipe)                      │
│       - RLS (Isolamento completo entre equipes por team_id)            │
│       - PostgreSQL RPC: upsert_team_lead() (Deduplicação atômica)      │
│       - Supabase Realtime (Eventos push para outros operadores)        │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. Camadas do Sistema

### 2.1 Camada Desktop (Tauri 2 + Rust)
- **Runtime**: Rust 2021 + WebView2 do Windows.
- **Supervisor de Processos**: O `main.rs` inicia o processo `node src/index.js` no arranque e registra callbacks para `WindowEvent::CloseRequested` e `RunEvent::Exit`, garantindo que o backend Node.js e instâncias do Chromium sejam terminadas limpa e forçadamente, eliminando processos zumbis.
- **Segurança**: Bloqueio de portas de depuração externa e isolamento de tráfego.

### 2.2 Camada de Aplicação Backend (Node.js 20+)
- **API Server**: Express 5 com rotas REST e proteção local.
- **Gerenciador de Jobs (`JobManager`)**: Orquestração não bloqueante das pesquisas em lote.
- **Pipeline de Descoberta & Extração**:
  - Nominatim + Overpass API (OpenStreetMap) com expansão concêntrica de raio (0 a 110 km).
  - Google Places API (opcional).
  - Cheerio + Fetch para inspeção ultrarrápida de meta tags, CTAs, telefones, WhatsApp e e-mails.
  - Profile Analyzer do Instagram (análise pública heurística).
  - Módulo de Auditoria Web (`website-audit.js`) com 3 modos de execução.
- **Motor de Sincronização (`SyncWorker`)**:
  - Operação em background com ciclo de pulso a cada 5 segundos.
  - Despacho de lotes da `sync_queue` com controle de tentativas e backoff.
  - Assinatura nos canais Supabase Realtime para capturar pesquisas e leads gerados por outros operadores da mesma equipe.

### 2.3 Camada de Persistência Local (SQLite Nativo)
- Implementado via `node:sqlite` nativo do Node.js 22/24.
- Modo WAL (`Write-Ahead Logging`) e `PRAGMA synchronous = NORMAL`, permitindo centenas de leituras e escritas simultâneas com latência sub-milissegundo.

### 2.4 Camada de Nuvem Compartilhada (Supabase)
- PostgreSQL com Row Level Security (RLS) mandatário em todas as tabelas.
- Deduplicação inteligente de leads por `google_place_id`, `osm_id`, domínio normalizado e telefone formatado em E.164.
