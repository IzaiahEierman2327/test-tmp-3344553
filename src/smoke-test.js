'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, clipboard, session } = require('electron');
const { isCacheableMainFrame } = require('./core/cache-policy');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceFinished(contents) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      contents.removeListener('did-finish-load', done);
      contents.removeListener('did-fail-load', failed);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      cleanup();
      reject(new Error(`Smoke navigation failed (${code}): ${description} ${url}`));
    };
    contents.once('did-finish-load', done);
    contents.on('did-fail-load', failed);
  });
}

async function loadAndWait(contents, url, options) {
  const finished = onceFinished(contents);
  await contents.loadURL(url, options);
  await finished;
}

async function verifyPortableStorage(browserSession, dataPaths) {
  if (!dataPaths) return;
  if (process.env.PHW_EXPECT_PORTABLE === '1') {
    assert.equal(dataPaths.portableMode, true, 'packaged portable smoke must detect portable mode');
  }
  if (!dataPaths.portableMode) return;

  assert.ok(dataPaths.runtimeSessionDir, 'portable mode must use an isolated runtime session directory');
  assert.equal(
    path.resolve(app.getPath('sessionData')),
    path.resolve(dataPaths.runtimeSessionDir),
    'Chromium runtime sessionData must be isolated from the portable data folder',
  );
  assert.equal(
    path.resolve(browserSession.getStoragePath()),
    path.resolve(dataPaths.browserSessionDir),
    'persistent browser storage must stay in the portable browser-session folder',
  );

  const first = path.join(dataPaths.dataRoot, `.phw-portable-smoke-${process.pid}.tmp`);
  const second = `${first}.moved`;
  await fs.writeFile(first, 'portable-write-smoke', 'utf8');
  await fs.rename(first, second);
  await fs.rm(second, { force: true });
}

async function runSmokeTest({ browserSession = null, dataPaths = null } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': 'phw_smoke_cookie=ok; Path=/; SameSite=Lax',
      });
      res.end('<!doctype html><html><body><p id="copy">clipboard-smoke-value</p></body></html>');
      return;
    }
    if (req.url === '/error') {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body>temporary outage</body></html>');
      return;
    }
    if (req.url === '/submit' && req.method === 'POST') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html><body>submitted:${body}</body></html>`);
      });
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  const smokeSession = browserSession || session.fromPartition(`persist:phw-smoke-${process.pid}`, { cache: true });
  assert.equal(smokeSession.isPersistent(), true, 'browser session must be persistent');
  await verifyPortableStorage(smokeSession, dataPaths);

  const requests = new Map();
  const filter = { urls: [`${base}/*`] };
  smokeSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (details.resourceType === 'mainFrame' && details.webContentsId) {
      requests.set(details.webContentsId, {
        id: details.id,
        url: details.url,
        method: details.method,
        statusCode: null,
      });
    }
    callback({});
  });
  smokeSession.webRequest.onResponseStarted(filter, (details) => {
    if (details.resourceType !== 'mainFrame' || !details.webContentsId) return;
    const current = requests.get(details.webContentsId) || {};
    requests.set(details.webContentsId, {
      ...current,
      id: details.id,
      url: details.url,
      method: details.method,
      statusCode: details.statusCode,
    });
  });

  const win = new BrowserWindow({ show: true, width: 800, height: 600 });
  const view = new WebContentsView({
    webPreferences: {
      session: smokeSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 });
  win.focus();
  view.webContents.focus();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'phw-smoke-'));
  try {
    await loadAndWait(view.webContents, `${base}/ok`);
    const getRequest = requests.get(view.webContents.id);
    assert.equal(isCacheableMainFrame({
      url: `${base}/ok`,
      requestUrl: getRequest.url,
      method: getRequest.method,
      statusCode: getRequest.statusCode,
    }), true, '200 GET page should be cacheable');

    const cookies = await smokeSession.cookies.get({ url: base });
    assert.ok(
      cookies.some((cookie) => cookie.name === 'phw_smoke_cookie' && cookie.value === 'ok'),
      'persistent browser session must write cookies',
    );
    await view.webContents.executeJavaScript("localStorage.setItem('phw-smoke-storage', 'ok'); 'ok'");

    const snapshot = path.join(tmp, 'ok.mhtml');
    await view.webContents.savePage(snapshot, 'MHTML');
    assert.ok((await fs.stat(snapshot)).size > 0, 'MHTML snapshot should be written');

    clipboard.clear();
    view.webContents.focus();
    await view.webContents.executeJavaScript(`(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('copy'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    })()`).then((selection) => assert.equal(selection, 'clipboard-smoke-value'));
    await delay(50);
    view.webContents.copy();
    await delay(50);
    assert.equal(clipboard.readText(), 'clipboard-smoke-value', 'selected remote text should copy to system clipboard');

    await loadAndWait(view.webContents, `${base}/error`);
    const errorRequest = requests.get(view.webContents.id);
    assert.equal(errorRequest.statusCode, 503);
    assert.equal(isCacheableMainFrame({
      url: `${base}/error`,
      requestUrl: errorRequest.url,
      method: errorRequest.method,
      statusCode: errorRequest.statusCode,
    }), false, '503 response must not replace last-known-good cache');

    await loadAndWait(view.webContents, `${base}/submit`, {
      postData: [{ type: 'rawData', bytes: Buffer.from('answer=42') }],
      extraHeaders: 'Content-Type: application/x-www-form-urlencoded',
    });
    const postRequest = requests.get(view.webContents.id);
    assert.equal(String(postRequest.method).toUpperCase(), 'POST');
    assert.equal(isCacheableMainFrame({
      url: `${base}/submit`,
      requestUrl: postRequest.url,
      method: postRequest.method,
      statusCode: postRequest.statusCode,
    }), false, 'POST result must never be snapshot-cached automatically');

    await smokeSession.cookies.flushStore();
    smokeSession.flushStorageData();
  } finally {
    win.destroy();
    await fs.rm(tmp, { recursive: true, force: true });
    await closeServer(server);
  }
}

module.exports = { runSmokeTest };
