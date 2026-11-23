# Guia de Instalação e Execução do RadarXL 2.0

## 1. Requisitos de Sistema

- **Sistema Operacional**: Windows 10 ou Windows 11 (64-bit).
- **Processador**: 2 núcleos ou superior.
- **Memória RAM**: 4 GB mínimo (8 GB recomendado).
- **Espaço em Disco**: 500 MB livres.
- **Navegador**: Microsoft Edge (instalado de fábrica no Windows) ou Google Chrome.

---

## 2. Instalação para Usuários Finais (Instalador Windows)

1. Baixe o instalador oficial: `RadarXL-Setup.exe`.
2. Dê duplo clique no executável. O instalador configurará o aplicativo na pasta do usuário sem exigir permissões de administrador de sistema.
3. Um atalho com o ícone do RadarXL será criado na Área de Trabalho e no Menu Iniciar.
4. Abra o RadarXL pelo atalho e comece a pesquisar.

---

## 3. Instalação para Desenvolvedores e Equipes Técnicas

### 3.1 Instalar o Node.js e Dependências
Certifique-se de possuir o Node.js 20+ instalado na máquina. No PowerShell:

```powershell
# Clonar ou acessar a pasta do projeto
cd RadarXL

# Instalar dependências
npm.cmd install
```

### 3.2 Configurar o Arquivo `.env`
Copie o arquivo de exemplo:
```powershell
Copy-Item .env.example .env
```
Edite as variáveis conforme sua preferência (chaves de Supabase, Ollama, etc.).

### 3.3 Inicializar a Aplicação
```powershell
# Modo Produção
npm.cmd start

# Modo Desenvolvimento com Hot Reload
npm.cmd run dev
```

### 3.4 Compilar o Aplicativo Desktop com Tauri 2
Certifique-se de possuir o toolchain Rust instalado (`rustc` e `cargo`).
```powershell
# Testar janela Tauri em modo desenvolvimento
npx.cmd @tauri-apps/cli dev

# Gerar o instalador final RadarXL-Setup.exe
npx.cmd @tauri-apps/cli build
```
O executável e o instalador gerados estarão localizados em:
`src-tauri/target/release/bundle/nsis/RadarXL-Setup.exe`
