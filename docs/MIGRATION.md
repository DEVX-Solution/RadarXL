# Guia de Migração de Dados do Radar de Leads BR

O RadarXL 2.0 inclui um sistema automático, idempotente e não destrutivo de migração dos arquivos legados em formato JSON para o novo banco de dados SQLite (`data/radarxl.db`).

---

## 1. Princípios da Migração

1. **Backup Pré-Migração Mandatório**: Antes de qualquer leitura ou conversão, os arquivos `data/leads.json` e `data/archives.json` são copiados integralmente com timestamp para a pasta `data/backup_pre_migration/`.
2. **Preservação de Dados Originais**: Os arquivos JSON originais **nunca são apagados**.
3. **Idempotência**: O processo de migração pode ser executado múltiplas vezes sem criar leads duplicados no SQLite.
4. **Preservação de Favoritos e Auditorias**: Todas as notas de performance, análises de IA, problemas comerciais e flags de favoritos são preservados integralmente.

---

## 2. Execução Automática

A migração é executada automaticamente no primeiro arranque do RadarXL 2.0. Ao rodar `npm.cmd start` ou abrir o aplicativo, o módulo `migration-runner.js` verifica se há dados antigos em `data/leads.json` e importa tudo para o SQLite.

---

## 3. Execução Manual via Linha de Comando

Caso você queira rodar a migração manualmente e conferir o relatório:

```powershell
npm.cmd run migrate
```

Exemplo de saída do relatório:
```json
{
  "startedAt": "2026-11-23T03:52:18.230Z",
  "leadsFoundInJson": 120,
  "leadsMigrated": 120,
  "leadsDeduplicated": 0,
  "archivesFoundInJson": 5,
  "archivesMigrated": 5,
  "backupCreated": true,
  "backupPaths": [
    "C:\\RadarXL\\data\\backup_pre_migration\\leads_2026-11-23T03-52-18.json",
    "C:\\RadarXL\\data\\backup_pre_migration\\archives_2026-11-23T03-52-18.json"
  ],
  "errors": [],
  "finishedAt": "2026-11-23T03:52:18.245Z",
  "success": true
}
```

O relatório completo é salvo em `data/migration_report.json`.
