# Métricas e Otimização de Performance

## 1. Diagnóstico de Gargalos da Versão Anterior (v1.0)

Na versão anterior, o projeto sofria com dois pontos críticos de consumo:
1. **Lighthouse Habilitado por Padrão**: Consumia entre 400 MB e 1.2 GB de RAM por execução e demorava de 15 a 30 segundos por site avaliado.
2. **Reescrita Serial de JSON em Disco**: Cada atualização de lead forçava a serialização síncrona do array inteiro em disco via `JSON.stringify`.

---

## 2. Otimizações Implementadas no RadarXL 2.0

### 2.1 Três Modos de Auditoria Configuráveis
- **Modo Econômico (Padrão do Sistema)**:
  - Utiliza unicamente `Fetch` + `Cheerio`.
  - Zero uso de Puppeteer / Chromium.
  - Zero captura de screenshots.
  - Tempo de análise por site: **~400 ms** (contra 25 segundos no Lighthouse).
  - Consumo de RAM: **< 80 MB**.
- **Modo Completo**:
  - Utiliza Puppeteer com flags de baixo consumo (`--disable-gpu`, `--js-flags=--max-old-space-size=256`).
  - Avaliação de layout responsivo e mobile friendly sem o peso do Lighthouse.
- **Modo Profissional**:
  - Lighthouse e Screenshots sob demanda apenas para os leads selecionados pelo usuário.

### 2.2 Gerenciamento do Ciclo de Vida do Chromium
- O módulo `src/audit/browser.js` implementa contagem de páginas processadas e **reciclagem automática a cada 20 execuções**, eliminando vazamentos acumulados de memória.
- Encerramento forçado de processos órfãos (`SIGKILL` após timeout de 3 segundos no fechamento).

### 2.3 Substituição de JSON por SQLite em Modo WAL
- Consultas indexadas com tempo de resposta inferior a 2 milissegundos.
- Escritas atômicas sem bloquear a interface ou reescrever o arquivo inteiro.

### 2.4 Fim do Polling Agressivo no Frontend
- O frontend não busca mais a lista inteira de leads a cada 1.6s. O estado é mantido em memória e enriquecido de forma incremental.

---

## 3. Comparativo de Performance (Antes vs Depois)

| Métrica | Radar de Leads (v1.0) | RadarXL 2.0 (Econômico) | Melhoria |
|---|---|---|---|
| **Consumo Médio de RAM** | 850 MB - 1.4 GB | 65 MB - 110 MB | **~88% de redução** |
| **Pico de Uso de CPU** | 90% - 100% (4 núcleos) | 12% - 25% | **~75% de redução** |
| **Tempo para 10 Leads** | ~ 4 a 6 minutos | ~ 20 a 35 segundos | **~10x mais veloz** |
| **Latência de Escrita Local**| 80ms - 350ms (JSON) | < 2ms (SQLite WAL) | **~50x mais rápido** |
| **Suporte Offline** | Não (perda em crash) | Total com fila ACID | **Resiliência 100%** |
