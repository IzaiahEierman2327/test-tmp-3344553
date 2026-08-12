'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StateStore } = require('../src/core/state-store');
const { createDefaultState } = require('../src/core/default-state');

test('state store creates defaults and persists updates atomically', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'phw-state-'));
  try {
    const store = new StateStore(path.join(dir, 'state.json'));
    const state = await store.load();
    state.settings.splitRatio = 0.42;
    await store.save(state);
    const loaded = await store.load();
    assert.equal(loaded.settings.splitRatio, 0.42);
    assert.ok(loaded.workspaces[loaded.activeWorkspaceId]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('one failed write does not poison all later saves', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'phw-state-recover-'));
  const file = path.join(dir, 'state.json');
  try {
    await fs.mkdir(file);
    const store = new StateStore(file);
    const state = createDefaultState();
    await assert.rejects(store.save(state));
    await fs.rm(file, { recursive: true, force: true });
    state.settings.splitRatio = 0.61;
    await store.save(state);
    const loaded = await store.load();
    assert.equal(loaded.settings.splitRatio, 0.61);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
