'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldQuitWhenAllWindowsClosed,
  shouldRecreateMainWindowOnActivate,
} = require('../src/core/lifecycle');

test('macOS keeps the app alive when the last window closes', () => {
  assert.equal(shouldQuitWhenAllWindowsClosed('darwin'), false);
  assert.equal(shouldQuitWhenAllWindowsClosed('win32'), true);
  assert.equal(shouldQuitWhenAllWindowsClosed('linux'), true);
});

test('activate recreates a missing main window', () => {
  assert.equal(shouldRecreateMainWindowOnActivate(false), true);
  assert.equal(shouldRecreateMainWindowOnActivate(true), false);
});
