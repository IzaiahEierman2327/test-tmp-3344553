'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const pkg = require('../package.json');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: options.env || process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function buildWindows() {
  const npx = process.env.ComSpec || 'cmd.exe';
  run(npx, ['/d', '/s', '/c', 'npx electron-builder --win nsis --publish never']);

  const unpacked = path.join(distDir, 'win-unpacked');
  if (!fs.existsSync(unpacked)) {
    throw new Error(`Expected unpacked Windows app at ${unpacked}`);
  }

  const stageName = 'Puzzle Hunt Workbench';
  const stageDir = path.join(distDir, stageName);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.cpSync(unpacked, stageDir, { recursive: true });
  fs.writeFileSync(
    path.join(stageDir, '.puzzle-hunt-workbench-portable'),
    'This marker makes Puzzle Hunt Workbench keep its default application data beside this portable copy.\n',
    'utf8',
  );

  const artifact = path.join(
    distDir,
    `Puzzle-Hunt-Workbench-${pkg.version}-Windows-Portable-${process.arch}.zip`,
  );
  fs.rmSync(artifact, { force: true });

  const env = {
    ...process.env,
    PHW_PORTABLE_STAGE: stageDir,
    PHW_PORTABLE_ZIP: artifact,
  };
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Compress-Archive -LiteralPath $env:PHW_PORTABLE_STAGE -DestinationPath $env:PHW_PORTABLE_ZIP -CompressionLevel Optimal -Force',
    ],
    { env },
  );

  console.log(`Created Windows portable archive: ${artifact}`);
}

if (process.platform === 'win32') {
  buildWindows();
} else {
  run('npx', ['electron-builder', '--publish', 'never']);
}
