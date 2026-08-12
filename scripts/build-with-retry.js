'use strict';

const { spawnSync } = require('node:child_process');

const maxAttempts = 3;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runPackaging() {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run dist'], {
      stdio: 'inherit',
      env: process.env,
    });
  }
  return spawnSync('/bin/sh', ['-c', 'npm run dist'], {
    stdio: 'inherit',
    env: process.env,
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`Packaging attempt ${attempt}/${maxAttempts}`);
  const result = runPackaging();

  if (result.status === 0) process.exit(0);
  if (result.error) console.warn(`Packaging process error: ${result.error.message}`);
  if (attempt === maxAttempts) process.exit(result.status || 1);

  console.warn(`Packaging attempt ${attempt} failed with exit code ${result.status}; retrying after a short delay.`);
  sleep(5000 * attempt);
}
