import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createKeyStore } from '../server/key-store';

test('Windows vault encrypts synthetic keys, survives restart, and removes saved copies', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flashmap-vault-test-'));
  const filename = path.join(directory, 'ai-key.dpapi');
  const key = 'synthetic-vault-key-1234567890';
  try {
    const store = createKeyStore(directory);
    await store.set(key, true);
    assert.equal((await readFile(filename, 'utf8')).includes(key), false);
    assert.equal(await createKeyStore(directory).get(), key);
    await store.set('another-synthetic-key-1234567890', true);
    assert.equal(await createKeyStore(directory).get(), 'another-synthetic-key-1234567890');
    await store.set(key, false);
    await assert.rejects(stat(filename), { code: 'ENOENT' });
    assert.equal(await store.get(), key);
    await store.clear(); assert.equal(await store.get(), '');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
