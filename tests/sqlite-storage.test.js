import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../src/storage/sqlite-db.js';
import { LeadStore } from '../src/storage/lead-store.js';
import { ArchiveStore } from '../src/storage/archive-store.js';

test('Storage SQLite: inserção, listagem e busca rápida', async () => {
  const db = initDatabase(':memory:', true);
  const store = await new LeadStore(db).init();

  const lead1 = await store.upsert({
    empresa: 'Advocacia Silva',
    categoria: 'advogado',
    cidade: 'São Paulo',
    estado: 'SP',
    site: 'https://silvaadv.com.br',
    score: 85
  });

  assert.ok(lead1.id);
  assert.equal(lead1.empresa, 'Advocacia Silva');

  const list = store.list({ search: 'Silva' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, lead1.id);
});

test('Storage SQLite: favoritos persistentes e ordenação', async () => {
  const db = initDatabase(':memory:', true);
  const store = await new LeadStore(db).init();

  const lead = await store.upsert({
    empresa: 'Clínica Odonto',
    categoria: 'dentista',
    cidade: 'Campinas',
    site: 'https://odontocampinas.com.br',
    score: 60
  });

  assert.equal(lead.favorite, false);
  const favorited = await store.setFavorite(lead.id, true);
  assert.equal(favorited.favorite, true);

  const check = store.get(lead.id);
  assert.equal(check.favorite, true);
});

test('Storage SQLite: arquivamento de lote e restauração intacta', async () => {
  const db = initDatabase(':memory:', true);
  const store = await new LeadStore(db).init();
  const archiveStore = await new ArchiveStore(db).init();

  await store.upsert({
    empresa: 'Auto Peças Express',
    categoria: 'mecanica',
    cidade: 'Santos',
    site: 'https://autopecasexpress.com.br',
    score: 75
  });

  const activeLeads = store.all();
  assert.equal(activeLeads.length, 1);

  const archive = await archiveStore.create(activeLeads);
  assert.ok(archive.id);
  assert.equal(archive.count, 1);

  await store.clear();
  assert.equal(store.all().length, 0);

  // Restaurar lote
  const retrievedArchive = archiveStore.get(archive.id);
  for (const l of retrievedArchive.leads) {
    await store.upsert(l);
  }

  assert.equal(store.all().length, 1);
  assert.equal(store.all()[0].empresa, 'Auto Peças Express');
});
