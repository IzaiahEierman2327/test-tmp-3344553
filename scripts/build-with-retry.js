'use strict';

const { spawnSync } = require('node:child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const maxAttempts = 3;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`Packaging attempt ${attempt}/${maxAttempts}`);
  const result = spawnSync(npm, ['run', 'dist'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  if (result.status === 0) process.exit(0);
  if (attempt === maxAttempts) process.exit(result.status || 1);

  console.warn(`Packaging attempt ${attempt} failed with exit code ${result.status}; retrying after a short delay.`);
  sleep(5000 * attempt);
}
