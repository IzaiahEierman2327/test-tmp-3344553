'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cacheFileName, canonicalCacheUrl, isFreshCache } = require('../src/core/cache');

test('cache filenames are stable and filesystem safe', () => {
  assert.equal(cacheFileName('https://example.com/a'), cacheFileName('https://example.com/a'));
  assert.match(cacheFileName('https://example.com/a'), /^[a-f0-9]+\.mhtml$/);
});

test('URL fragments share the same page snapshot key', () => {
  assert.equal(canonicalCacheUrl('https://example.com/a#part'), 'https://example.com/a');
  assert.equal(cacheFileName('https://example.com/a#one'), cacheFileName('https://example.com/a#two'));
});

test('cache freshness honors retention', () => {
  const now = 10 * 86400000;
  assert.equal(isFreshCache({ path: 'x', cachedAt: now - 6 * 86400000 }, 7, now), true);
  assert.equal(isFreshCache({ path: 'x', cachedAt: now - 8 * 86400000 }, 7, now), false);
});
