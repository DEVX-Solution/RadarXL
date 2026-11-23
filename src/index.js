import fs from 'node:fs/promises';
import { config } from './config.js';
import { initDatabase, closeDatabase } from './storage/sqlite-db.js';
import { runJsonMigration } from './storage/migration-runner.js';
import { LeadStore } from './storage/lead-store.js';
import { ArchiveStore } from './storage/archive-store.js';
import { LeadPipeline } from './pipeline/lead-pipeline.js';
import { JobManager } from './dashboard/job-manager.js';
import { createServer } from './dashboard/server.js';
import { closeBrowser } from './audit/browser.js';
import { SyncWorker } from './sync/sync-worker.js';
import { logger } from './utils/logger.js';

await fs.mkdir(config.dataDir, { recursive: true });
await fs.mkdir(config.screenshotDir, { recursive: true });

// Inicializa banco SQLite local
const db = initDatabase();

// Executa migração automática de dados legados se existirem
await runJsonMigration({ db });

const store = await new LeadStore(db).init();
const archiveStore = await new ArchiveStore(db).init();
const pipeline = new LeadPipeline(store, archiveStore);
const jobs = new JobManager();
const syncWorker = new SyncWorker(db);

// Inicia worker de sincronização offline-first
syncWorker.start(6000);

const app = createServer({ store, archiveStore, pipeline, jobs, syncWorker });
const server = app.listen(config.port, config.host, () => {
  logger.info(`RadarXL 2.0 Intelligence ativo em http://${config.host}:${config.port}`);
});

async function shutdown(signal) {
  logger.info(`Encerrando RadarXL 2.0 (${signal})`);
  syncWorker.stop();
  server.close();
  await closeBrowser();
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => logger.error('Exceção não capturada', { error }));
process.on('unhandledRejection', (error) => logger.error('Promise rejeitada sem tratamento', { error }));
