# RADARXL 2.0 INTELLIGENCE
### Aplicativo Desktop Windows | Inteligência Comercial | Prospecção de Empresas | Sincronização em Equipe

> **Encontre oportunidades. Conquiste negócios.**

O **RadarXL 2.0** é a evolução corporativa do antigo Radar de Leads BR, projetado para prospecção ativa de empresas brasileiras, auditoria técnica de presença digital, análise comercial via Inteligência Artificial e **sincronização compartilhada em tempo real entre todos os membros da sua equipe**, utilizando infraestrutura gratuita com Supabase e armazenamento local ultrarrápido em SQLite.

---

## 🚀 Principais Diferenciais da Versão 2.0

- 🖥️ **Aplicativo Desktop Windows com Tauri 2 + Rust**: Inicialização instantânea, baixo consumo de memória e empacotamento nativo com WebView2.
- ⚡ **Otimização Extrema de Recursos**: Três modos de auditoria (*Econômico*, *Completo* e *Profissional*). Lighthouse desativado por padrão para economizar 80% de RAM e CPU.
- 🗄️ **Armazenamento Híbrido Local SQLite**: Transações ACID seguras, eliminação de gargalos com arquivos JSON planos e persistência de histórico.
- ☁️ **Sincronização Compartilhada Gratuita via Supabase**: Todos os colaboradores de uma equipe visualizam em tempo real as pesquisas uns dos outros sem necessidade de VPS ou servidores pagos.
- 🛡️ **Offline-First com Fila Resiliente (`sync_queue`)**: Continue prospectando mesmo sem internet. Quando a conexão retornar, tudo é sincronizado e deduplicado automaticamente.
- 🤖 **IA Comercial Flexível**: Suporte a modelos locais via Ollama, endpoints OpenAI ou fallback determinístico em português brasileiro com templates de alta conversão.
- 👥 **Controle de Acesso & RLS**: Autenticação com isolamento estrito entre equipes garantido no banco de dados.

---

## 📁 Estrutura da Documentação

- [Arquitetura de Sistemas](docs/ARCHITECTURE.md)
- [Modelagem de Dados & SQLite](docs/DATABASE.md)
- [Guia de Configuração do Supabase Gratuito](docs/SUPABASE_SETUP.md)
- [Instalação e Execução](docs/INSTALLATION.md)
- [Guia de Migração de Dados Antigos](docs/MIGRATION.md)
- [Métricas e Otimização de Performance](docs/PERFORMANCE.md)
- [Segurança, RLS e LGPD](docs/SECURITY.md)
- [Histórico de Mudanças (Changelog)](docs/CHANGELOG.md)

---

## 🛠️ Como Iniciar Rapidamente

### 1. Pré-requisitos
- Node.js 20 ou superior (recomendado Node 22/24)
- Rust (para compilar o pacote desktop Tauri)

### 2. Instalação de Dependências
```powershell
npm.cmd install
```

### 3. Execução em Modo de Desenvolvimento
```powershell
# Iniciar o servidor local com banco SQLite e worker de sincronização
npm.cmd start
```
Acesse no seu navegador: `http://127.0.0.1:3000`

### 4. Executar a Suíte de Testes
```powershell
npm.cmd test
```

### 5. Compilar o Instalador Desktop Windows (`RadarXL-Setup.exe`)
```powershell
npx.cmd @tauri-apps/cli build
```

---

## 🏢 Identidade Visual & Design System
O RadarXL 2.0 utiliza interface **Dark Mode nativa** com toques ciano tecnológico (`#00f2fe`), cards com telemetria de consumo de hardware (CPU/RAM), badges de conectividade em tempo real e navegação fluida em 11 seções de inteligência comercial.

---
© 2026 DEVX Solutions. Todos os direitos reservados.
