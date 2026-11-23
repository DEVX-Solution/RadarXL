import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../src/storage/sqlite-db.js';
import { LeadStore } from '../src/storage/lead-store.js';
import { SyncWorker } from '../src/sync/sync-worker.js';

test('Offline & Sync: enfileiramento automático de leads para sincronização posterior', async () => {
  const db = initDatabase(':memory:');
  const store = await new LeadStore(db).init();
  const syncWorker = new SyncWorker(db);

  assert.equal(syncWorker.getPendingCount(), 0);

  // Usuário cadastra ou descobre empresa offline
  await store.upsert({
    empresa: 'Padaria do Bairro',
    cidade: 'Sorocaba',
    site: 'https://padariadobairro.com.br',
    score: 80
  });

  // Deve ter entrado na fila pendente
  assert.equal(syncWorker.getPendingCount(), 1);

  // Alteração de favorito também gera evento de sincronização
  const all = store.all();
  await store.setFavorite(all[0].id, true);
  assert.equal(syncWorker.getPendingCount(), 2);
});

test('Simulação Multi-Computador: Computador B recebe e persiste pesquisa de Computador A', async () => {
  const dbB = initDatabase(':memory:');
  const syncWorkerB = new SyncWorker(dbB);

  let remoteNotified = false;
  syncWorkerB.onRemoteUpdate = (event) => {
    if (event.type === 'search') remoteNotified = true;
  };

  // Simula recebimento de payload Realtime vindo do Computador A via Supabase
  syncWorkerB.handleRemoteSearchChange({
    eventType: 'INSERT',
    new: {
      id: 'search_comp_a_123',
      categoria: 'energia solar',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      limite: 15,
      status: 'concluido',
      completed_count: 15,
      desired_count: 15,
      created_by_name: 'Usuário Computador A',
      created_at: new Date().toISOString()
    }
  });

  assert.equal(remoteNotified, true);
  
  // Verifica se Computador B gravou no SQLite local
  const localSearches = dbB.prepare(`SELECT * FROM local_searches WHERE id = 'search_comp_a_123'`).all();
  assert.equal(localSearches.length, 1);
  assert.equal(localSearches[0].created_by_name, 'Usuário Computador A');
});
