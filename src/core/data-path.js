'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR_NAME = 'Puzzle Hunt Workbench Data';
const BOOTSTRAP_FILE = '.puzzle-hunt-workbench-bootstrap.json';
const PORTABLE_MARKER_FILE = '.puzzle-hunt-workbench-portable';
const BROWSER_SESSION_DIR_NAME = 'browser-session';
const RUNTIME_SESSION_PREFIX = 'puzzle-hunt-workbench-runtime-';

function cleanPath(value) {
  return path.resolve(String(value || ''));
}

function pathsOverlap(a, b) {
  const aa = cleanPath(a);
  const bb = cleanPath(b);
  if (aa === bb) return true;
  const relAB = path.relative(aa, bb);
  const relBA = path.relative(bb, aa);
  return (
    (relAB !== '' && !relAB.startsWith(`..${path.sep}`) && relAB !== '..' && !path.isAbsolute(relAB)) ||
    (relBA !== '' && !relBA.startsWith(`..${path.sep}`) && relBA !== '..' && !path.isAbsolute(relBA))
  );
}

function dataRootFromParent(parent) {
  const selected = cleanPath(parent);
  return path.basename(selected) === DATA_DIR_NAME ? selected : path.join(selected, DATA_DIR_NAME);
}

function bootstrapPath(appData, portableDir = null) {
  if (portableDir) return path.join(cleanPath(portableDir), BOOTSTRAP_FILE);
  return path.join(cleanPath(appData), BOOTSTRAP_FILE);
}

function readBootstrap(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeBootstrap(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function detectPortableDir({ env = process.env, execPath = process.execPath, existsSync = fs.existsSync } = {}) {
  if (env.PORTABLE_EXECUTABLE_DIR) return cleanPath(env.PORTABLE_EXECUTABLE_DIR);
  const executableDir = path.dirname(cleanPath(execPath));
  return existsSync(path.join(executableDir, PORTABLE_MARKER_FILE)) ? executableDir : null;
}

function resolveDataRoot({ defaultUserData, portableDir, bootstrap = {} }) {
  if (bootstrap.dataRoot) return cleanPath(bootstrap.dataRoot);
  if (portableDir) return path.join(cleanPath(portableDir), DATA_DIR_NAME);
  return cleanPath(defaultUserData);
}

function performPendingMigration(bootstrapFile, bootstrap) {
  const pending = bootstrap.pendingMigration || (
    bootstrap.pendingMigrationFrom && bootstrap.dataRoot
      ? { from: bootstrap.pendingMigrationFrom, to: bootstrap.dataRoot }
      : null
  );
  if (!pending?.from || !pending?.to) return { bootstrap, migrationError: null };

  const source = cleanPath(pending.from);
  const target = cleanPath(pending.to);
  if (pathsOverlap(source, target)) {
    const message = 'Data migration source and destination must not contain each other.';
    const next = { ...bootstrap, dataRoot: source, pendingMigration: { from: source, to: target }, migrationError: message };
    delete next.pendingMigrationFrom;
    writeBootstrap(bootstrapFile, next);
    return { bootstrap: next, migrationError: message };
  }

  try {
    fs.mkdirSync(target, { recursive: true });
    if (source !== target && fs.existsSync(source)) {
      fs.cpSync(source, target, { recursive: true, force: true, errorOnExist: false });
    }
    const next = { version: 2, dataRoot: target };
    writeBootstrap(bootstrapFile, next);
    return { bootstrap: next, migrationError: null };
  } catch (error) {
    const message = `Data migration failed; continuing with the previous data folder. ${error.message}`;
    const next = {
      version: 2,
      dataRoot: source,
      pendingMigration: { from: source, to: target },
      migrationError: message,
    };
    writeBootstrap(bootstrapFile, next);
    return { bootstrap: next, migrationError: message };
  }
}

function verifyWritableDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const first = path.join(directory, `.phw-write-check-${process.pid}-${Date.now()}.tmp`);
  const second = `${first}.moved`;
  try {
    fs.writeFileSync(first, 'write-check', 'utf8');
    fs.renameSync(first, second);
  } finally {
    try { fs.rmSync(first, { force: true }); } catch {}
    try { fs.rmSync(second, { force: true }); } catch {}
  }
}

function createRuntimeSessionDir(tempDir) {
  const parent = cleanPath(tempDir);
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, RUNTIME_SESSION_PREFIX));
}

function prepareDataPaths(app, { portableDir = detectPortableDir() } = {}) {
  const defaultUserData = app.getPath('userData');
  const file = bootstrapPath(app.getPath('appData'), portableDir);
  let bootstrap = readBootstrap(file);
  let migrationError = null;

  if (bootstrap.pendingMigration || bootstrap.pendingMigrationFrom) {
    const result = performPendingMigration(file, bootstrap);
    bootstrap = result.bootstrap;
    migrationError = result.migrationError;
  }

  let dataRoot = resolveDataRoot({ defaultUserData, portableDir, bootstrap });
  try {
    verifyWritableDirectory(dataRoot);
  } catch (error) {
    if (portableDir) {
      throw new Error(
        `Portable data folder is not writable: ${dataRoot}. Fully extract the ZIP to a writable folder before launching. ${error.message}`,
      );
    }
    migrationError ||= `Configured data folder is unavailable; using the default folder. ${error.message}`;
    dataRoot = cleanPath(defaultUserData);
    verifyWritableDirectory(dataRoot);
  }

  const browserSessionDir = path.join(dataRoot, BROWSER_SESSION_DIR_NAME);
  verifyWritableDirectory(browserSessionDir);

  let runtimeSessionDir = null;
  if (portableDir) {
    runtimeSessionDir = createRuntimeSessionDir(app.getPath('temp'));
    app.setPath('sessionData', runtimeSessionDir);
  }

  app.setPath('userData', dataRoot);
  return {
    dataRoot,
    browserSessionDir,
    runtimeSessionDir,
    bootstrapFile: file,
    defaultUserData: cleanPath(defaultUserData),
    portableMode: Boolean(portableDir),
    migrationError,
  };
}

function planDataMigration({ bootstrapFile, currentDataRoot, targetParent }) {
  const current = cleanPath(currentDataRoot);
  const target = dataRootFromParent(targetParent);
  if (current === target) return { changed: false, dataRoot: current };
  if (pathsOverlap(current, target)) throw new Error('Choose a folder outside the current data directory.');
  writeBootstrap(bootstrapFile, {
    version: 2,
    dataRoot: current,
    pendingMigration: { from: current, to: target },
  });
  return { changed: true, dataRoot: target };
}

module.exports = {
  DATA_DIR_NAME,
  BOOTSTRAP_FILE,
  PORTABLE_MARKER_FILE,
  BROWSER_SESSION_DIR_NAME,
  RUNTIME_SESSION_PREFIX,
  bootstrapPath,
  dataRootFromParent,
  detectPortableDir,
  pathsOverlap,
  readBootstrap,
  resolveDataRoot,
  performPendingMigration,
  verifyWritableDirectory,
  createRuntimeSessionDir,
  prepareDataPaths,
  planDataMigration,
};
