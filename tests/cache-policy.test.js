'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isCacheableMainFrame,
  isServerFailureStatus,
  cacheMatchesUrl,
  canUseOfflineCache,
} = require('../src/core/cache-policy');

test('only successful GET main-frame responses are cacheable', () => {
  assert.equal(isCacheableMainFrame({ url: 'https://hunt.example/p/1', requestUrl: 'https://hunt.example/p/1', method: 'GET', statusCode: 200 }), true);
  assert.equal(isCacheableMainFrame({ url: 'https://hunt.example/submit', requestUrl: 'https://hunt.example/submit', method: 'POST', statusCode: 200 }), false);
  assert.equal(isCacheableMainFrame({ url: 'https://hunt.example/p/1', requestUrl: 'https://hunt.example/p/1', method: 'GET', statusCode: 503 }), false);
});

test('cache must belong to the exact displayed URL', () => {
  const cache = { path: 'a.mhtml', sourceUrl: 'https://hunt.example/p/1', cachedAt: Date.now() };
  assert.equal(cacheMatchesUrl(cache, 'https://hunt.example/p/1#answer'), true);
  assert.equal(cacheMatchesUrl(cache, 'https://hunt.example/p/2'), false);
});

test('offline fallback never replays POST semantics', () => {
  const now = Date.now();
  const cache = { path: 'a.mhtml', sourceUrl: 'https://hunt.example/submit', cachedAt: now };
  assert.equal(canUseOfflineCache({ cache, url: 'https://hunt.example/submit', method: 'POST', retentionDays: 7, now }), false);
  assert.equal(canUseOfflineCache({ cache, url: 'https://hunt.example/submit', method: 'GET', retentionDays: 7, now }), true);
});

test('server outage statuses are eligible for last-known-good fallback', () => {
  assert.equal(isServerFailureStatus(503), true);
  assert.equal(isServerFailureStatus(500), true);
  assert.equal(isServerFailureStatus(429), true);
  assert.equal(isServerFailureStatus(404), false);
});
