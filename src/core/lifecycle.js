'use strict';

function shouldQuitWhenAllWindowsClosed(platform = process.platform) {
  return platform !== 'darwin';
}

function shouldRecreateMainWindowOnActivate(hasMainWindow) {
  return !hasMainWindow;
}

module.exports = { shouldQuitWhenAllWindowsClosed, shouldRecreateMainWindowOnActivate };
