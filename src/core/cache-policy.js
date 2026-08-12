'use strict';

const { canonicalCacheUrl, isFreshCache } = require('./cache');

function normalizeMethod(value) {
  return String(value || '').toUpperCase();
}

function isSuccessfulStatus(statusCode) {
  const code = Number(statusCode);
  return Number.isInteger(code) && code >= 200 && code < 300;
}

function isServerFailureStatus(statusCode) {
  const code = Number(statusCode);
  return code === 429 || (Number.isInteger(code) && code >= 500 && code < 600);
}

function cacheMatchesUrl(cache, url) {
  if (!cache?.sourceUrl) return false;
  return canonicalCacheUrl(cache.sourceUrl) === canonicalCacheUrl(url);
}

function isCacheableMainFrame({ url, method, statusCode, requestUrl }) {
  const canonical = canonicalCacheUrl(url);
  if (!/^https?:\/\//i.test(canonical)) return false;
  if (normalizeMethod(method) !== 'GET') return false;
  if (!isSuccessfulStatus(statusCode)) return false;
  if (requestUrl && canonicalCacheUrl(requestUrl) !== canonical) return false;
  return true;
}

function canUseOfflineCache({ cache, url, method = 'GET', retentionDays, now = Date.now() }) {
  return (
    normalizeMethod(method) === 'GET' &&
    cacheMatchesUrl(cache, url) &&
    isFreshCache(cache, retentionDays, now)
  );
}

module.exports = {
  normalizeMethod,
  isSuccessfulStatus,
  isServerFailureStatus,
  cacheMatchesUrl,
  isCacheableMainFrame,
  canUseOfflineCache,
};
