'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

function canonicalCacheUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return String(input || '');
    url.hash = '';
    return url.href;
  } catch {
    return String(input || '');
  }
}

function cacheFileName(url) {
  const canonical = canonicalCacheUrl(url);
  return `${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24)}.mhtml`;
}

function isFreshCache(cache, retentionDays, now = Date.now()) {
  if (!cache?.path || !cache?.cachedAt) return false;
  return now - cache.cachedAt <= Math.max(1, Number(retentionDays) || 7) * 86400000;
}

class CacheStore {
  constructor(root) {
    this.root = root;
  }

  pathFor(url) {
    return path.join(this.root, cacheFileName(url));
  }

  async exists(file) {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }

  async metadataFor(url) {
    const sourceUrl = canonicalCacheUrl(url);
    const file = this.pathFor(sourceUrl);
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return null;
      return { path: file, cachedAt: stat.mtimeMs, sourceUrl };
    } catch {
      return null;
    }
  }

  async clean(retentionDays, now = Date.now()) {
    await fs.mkdir(this.root, { recursive: true });
    const maxAge = Math.max(1, Number(retentionDays) || 7) * 86400000;
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.mhtml')) continue;
      const file = path.join(this.root, entry.name);
      const stat = await fs.stat(file);
      if (now - stat.mtimeMs > maxAge) await fs.rm(file, { force: true });
    }
  }
}

module.exports = { CacheStore, cacheFileName, canonicalCacheUrl, isFreshCache };
