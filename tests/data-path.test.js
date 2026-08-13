'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  DATA_DIR_NAME,
  PORTABLE_MARKER_FILE,
  dataRootFromParent,
  detectPortableDir,
  pathsOverlap,
  readBootstrap,
  resolveDataRoot,
  performPendingMigration,
  planDataMigration,
} = require('../src/core/data-path');

test('portable builds default beside the portable executable', () => {
  const root = resolveDataRoot({ defaultUserData: path.resolve('/default'), portableDir: path.resolve('/portable'), bootstrap: {} });
  assert.equal(root, path.join(path.resolve('/portable'), DATA_DIR_NAME));
});

test('archive portable marker beside executable enables portable mode', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-portable-marker-'));
  try {
    const execPath = path.join(dir, 'Puzzle Hunt Workbench.exe');
    await fsp.writeFile(path.join(dir, PORTABLE_MARKER_FILE), 'portable');
    assert.equal(detectPortableDir({ env: {}, execPath }), path.resolve(dir));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('installed build without portable marker uses normal user data', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-installed-marker-'));
  try {
    const execPath = path.join(dir, 'Puzzle Hunt Workbench.exe');
    assert.equal(detectPortableDir({ env: {}, execPath }), null);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('legacy single-exe portable environment remains supported', () => {
  const portableDir = path.resolve('/legacy-portable');
  assert.equal(
    detectPortableDir({ env: { PORTABLE_EXECUTABLE_DIR: portableDir }, execPath: path.resolve('/installed/app.exe') }),
    portableDir,
  );
});

test('bootstrap data root overrides portable and default locations', () => {
  const chosen = path.resolve('/chosen');
  assert.equal(resolveDataRoot({ defaultUserData: '/default', portableDir: '/portable', bootstrap: { dataRoot: chosen } }), chosen);
});

test('selected parent receives a dedicated app data directory', () => {
  const parent = path.resolve('/disk/test-data');
  assert.equal(dataRootFromParent(parent), path.join(parent, DATA_DIR_NAME));
  const already = path.join(parent, DATA_DIR_NAME);
  assert.equal(dataRootFromParent(already), already);
});

test('migration rejects nested source and destination paths', () => {
  const root = path.resolve('/data/root');
  assert.equal(pathsOverlap(root, path.join(root, 'child')), true);
  assert.equal(pathsOverlap(path.join(root, 'child'), root), true);
  assert.equal(pathsOverlap(root, path.resolve('/other/root')), false);
});

test('migration plans keep the old data root active until copy succeeds', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-migrate-plan-'));
  try {
    const source = path.join(dir, 'old');
    const targetParent = path.join(dir, 'new-parent');
    const bootstrap = path.join(dir, 'bootstrap.json');
    await fsp.mkdir(source);
    const result = planDataMigration({ bootstrapFile: bootstrap, currentDataRoot: source, targetParent });
    const saved = readBootstrap(bootstrap);
    assert.equal(result.changed, true);
    assert.equal(saved.dataRoot, path.resolve(source));
    assert.equal(saved.pendingMigration.from, path.resolve(source));
    assert.equal(saved.pendingMigration.to, path.join(path.resolve(targetParent), DATA_DIR_NAME));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('pending migration copies data and commits the target atomically at bootstrap level', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-migrate-run-'));
  try {
    const source = path.join(dir, 'old');
    const target = path.join(dir, 'new');
    const bootstrap = path.join(dir, 'bootstrap.json');
    await fsp.mkdir(source);
    await fsp.writeFile(path.join(source, 'state.json'), 'hello');
    fs.writeFileSync(bootstrap, JSON.stringify({ version: 2, dataRoot: source, pendingMigration: { from: source, to: target } }));
    const result = performPendingMigration(bootstrap, readBootstrap(bootstrap));
    assert.equal(result.migrationError, null);
    assert.equal(result.bootstrap.dataRoot, path.resolve(target));
    assert.equal(await fsp.readFile(path.join(target, 'state.json'), 'utf8'), 'hello');
    assert.equal(readBootstrap(bootstrap).pendingMigration, undefined);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
