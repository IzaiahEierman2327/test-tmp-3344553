'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  BOOTSTRAP_FILE,
  BROWSER_SESSION_DIR_NAME,
  DATA_DIR_NAME,
  RUNTIME_SESSION_PREFIX,
  bootstrapPath,
  createRuntimeSessionDir,
  prepareDataPaths,
  verifyWritableDirectory,
} = require('../src/core/data-path');

function fakeApp(paths) {
  const current = { ...paths };
  const calls = [];
  return {
    calls,
    getPath(name) {
      if (!Object.hasOwn(current, name)) throw new Error(`Missing fake app path: ${name}`);
      return current[name];
    },
    setPath(name, value) {
      current[name] = value;
      calls.push([name, value]);
    },
  };
}

test('portable bootstrap stays beside the portable executable instead of global appData', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-portable-bootstrap-'));
  try {
    const portable = path.join(root, 'portable');
    const appData = path.join(root, 'appdata');
    assert.equal(bootstrapPath(appData, portable), path.join(path.resolve(portable), BOOTSTRAP_FILE));
    assert.equal(bootstrapPath(appData), path.join(path.resolve(appData), BOOTSTRAP_FILE));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('writable-directory probe exercises Windows-style write then rename semantics', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-write-probe-'));
  try {
    const target = path.join(root, 'data');
    verifyWritableDirectory(target);
    assert.equal(fs.existsSync(target), true);
    assert.deepEqual((await fsp.readdir(target)).filter((name) => name.startsWith('.phw-write-check-')), []);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('runtime Chromium session directory is unique and rooted in the OS temp directory', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-runtime-parent-'));
  try {
    const first = createRuntimeSessionDir(root);
    const second = createRuntimeSessionDir(root);
    assert.notEqual(first, second);
    assert.equal(path.dirname(first), path.resolve(root));
    assert.ok(path.basename(first).startsWith(RUNTIME_SESSION_PREFIX));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('portable prepareDataPaths separates durable data from Chromium runtime sessionData', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-portable-plan-'));
  try {
    const portableDir = path.join(root, 'portable');
    const defaultUserData = path.join(root, 'installed-user-data');
    const appData = path.join(root, 'global-app-data');
    const temp = path.join(root, 'temp');
    await fsp.mkdir(portableDir, { recursive: true });
    const app = fakeApp({ userData: defaultUserData, appData, temp, sessionData: defaultUserData });

    const result = prepareDataPaths(app, { portableDir });
    const expectedDataRoot = path.join(path.resolve(portableDir), DATA_DIR_NAME);

    assert.equal(result.portableMode, true);
    assert.equal(result.dataRoot, expectedDataRoot);
    assert.equal(result.browserSessionDir, path.join(expectedDataRoot, BROWSER_SESSION_DIR_NAME));
    assert.equal(result.bootstrapFile, path.join(path.resolve(portableDir), BOOTSTRAP_FILE));
    assert.equal(path.dirname(result.runtimeSessionDir), path.resolve(temp));
    assert.notEqual(path.resolve(result.runtimeSessionDir), path.resolve(result.dataRoot));
    assert.deepEqual(app.calls.map(([name]) => name), ['sessionData', 'userData']);
    assert.equal(app.getPath('sessionData'), result.runtimeSessionDir);
    assert.equal(app.getPath('userData'), result.dataRoot);
    assert.equal(fs.existsSync(result.browserSessionDir), true);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('installed prepareDataPaths does not redirect Electron sessionData to a temporary directory', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'phw-installed-plan-'));
  try {
    const userData = path.join(root, 'user-data');
    const appData = path.join(root, 'app-data');
    const temp = path.join(root, 'temp');
    const app = fakeApp({ userData, appData, temp, sessionData: userData });

    const result = prepareDataPaths(app, { portableDir: null });
    assert.equal(result.portableMode, false);
    assert.equal(result.runtimeSessionDir, null);
    assert.equal(app.getPath('sessionData'), userData);
    assert.deepEqual(app.calls.map(([name]) => name), ['userData']);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
