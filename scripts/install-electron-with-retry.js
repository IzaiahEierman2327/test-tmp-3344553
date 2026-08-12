'use strict';

const { spawnSync } = require('node:child_process');

const maxAttempts = 3;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function installElectron(attempt) {
  const env = { ...process.env };
  if (attempt > 1) env.force_no_cache = 'true';

  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npx install-electron --no'], {
      stdio: 'inherit',
      env,
    });
  }
  return spawnSync('/bin/sh', ['-c', 'npx install-electron --no'], {
    stdio: 'inherit',
    env,
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`Electron binary install attempt ${attempt}/${maxAttempts}`);
  const result = installElectron(attempt);
  if (result.status === 0) process.exit(0);
  if (result.error) console.warn(`Electron install process error: ${result.error.message}`);
  if (attempt === maxAttempts) process.exit(result.status || 1);
  console.warn(`Electron binary install failed with exit code ${result.status}; retrying.`);
  sleep(5000 * attempt);
}
