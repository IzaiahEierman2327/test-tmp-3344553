'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { fileURLToPath, pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  dialog,
  Menu,
} = require('electron');
const { StateStore } = require('./core/state-store');
const { newPuzzleTab, newToolTab } = require('./core/default-state');
const { normalizeUserUrl, isRemoteHttpUrl } = require('./core/url');
const { calculateLayout } = require('./core/layout');
const { shouldSleepTool, toolOpacity } = require('./core/tool-lifecycle');
const { CacheStore, canonicalCacheUrl, isFreshCache } = require('./core/cache');
const {
  isCacheableMainFrame,
  isServerFailureStatus,
  canUseOfflineCache,
} = require('./core/cache-policy');
const {
  createWorkspaceInState,
  renameWorkspace,
  deleteWorkspaceFromState,
} = require('./core/workspace');
const { prepareDataPaths, planDataMigration } = require('./core/data-path');
const {
  shouldQuitWhenAllWindowsClosed,
  shouldRecreateMainWindowOnActivate,
} = require('./core/lifecycle');

const SESSION_PARTITION = 'persist:puzzle-hunt-workbench';
const LOCAL_UI_FILE = path.normalize(path.join(__dirname, 'ui', 'index.html'));
const dataPaths = prepareDataPaths(app);

let mainWindow = null;
let toolWindow = null;
let sharedSession = null;
let stateStore = null;
let cacheStore = null;
let state = null;
let canvasView = null;
let currentLayout = null;
let puzzleViews = new Map();
let toolViews = new Map();
let sleepTimer = null;
let allowMainDestroy = false;
let quitPrepared = false;
let quitPreparation = null;
const requestMeta = new Map();

const ws = () => state.workspaces[state.activeWorkspaceId];
const puzzleTab = () => ws().puzzleTabs.find((tab) => tab.id === ws().activePuzzleTabId) || ws().puzzleTabs[0];
const toolTab = () => ws().tools.tabs.find((tab) => tab.id === ws().tools.activeToolTabId) || null;

function navState(contents) {
  const history = contents?.navigationHistory;
  return {
    canGoBack: Boolean(history?.canGoBack()),
    canGoForward: Boolean(history?.canGoForward()),
  };
}

function snapshot() {
  return {
    state,
    navigation: {
      puzzle: navState(puzzleViews.get(puzzleTab()?.id)?.webContents),
      canvas: navState(canvasView?.webContents),
      tool: navState(toolViews.get(toolTab()?.id)?.webContents || toolWindow?.webContents),
    },
    layout: currentLayout,
    platform: process.platform,
    dataStorage: {
      path: app.getPath('userData'),
      portableMode: dataPaths.portableMode,
      migrationError: dataPaths.migrationError || null,
      sessionPersistent: Boolean(sharedSession?.isPersistent()),
    },
  };
}

function broadcast() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:state', snapshot());
}

async function persist() {
  await stateStore.save(state);
  broadcast();
}

function prefs() {
  return {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    backgroundThrottling: true,
    session: sharedSession,
  };
}

function trustedRendererUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'file:') return false;
    return path.normalize(fileURLToPath(url)) === LOCAL_UI_FILE;
  } catch {
    return false;
  }
}

function trustedIpc(event) {
  const url = event.senderFrame?.url || event.sender?.getURL?.() || '';
  return trustedRendererUrl(url);
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedIpc(event)) throw new Error(`Rejected untrusted IPC sender for ${channel}`);
    return fn(event, ...args);
  });
}

function configureSession() {
  if (dataPaths.portableMode) {
    sharedSession = session.fromPath(dataPaths.browserSessionDir, { cache: false });
    if (dataPaths.runtimeSessionDir) {
      sharedSession.setCodeCachePath(path.join(dataPaths.runtimeSessionDir, 'browser-code-cache'));
    }
  } else {
    sharedSession = session.fromPartition(SESSION_PARTITION, { cache: true });
  }
  const allowedPermissions = new Set(['clipboard-sanitized-write', 'fullscreen']);
  const permissionAllowed = (permission, url) => allowedPermissions.has(permission) && /^https:\/\//i.test(String(url || ''));

  sharedSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(permissionAllowed(permission, details?.requestingUrl || contents?.getURL?.()));
  });
  sharedSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
    return permissionAllowed(permission, requestingOrigin || contents?.getURL?.());
  });

  const filter = { urls: ['http://*/*', 'https://*/*'] };
  sharedSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (details.resourceType === 'mainFrame' && details.webContentsId) {
      requestMeta.set(details.webContentsId, {
        id: details.id,
        url: canonicalCacheUrl(details.url),
        method: String(details.method || 'GET').toUpperCase(),
        statusCode: null,
      });
    }
    callback({});
  });
  sharedSession.webRequest.onResponseStarted(filter, (details) => {
    if (details.resourceType !== 'mainFrame' || !details.webContentsId) return;
    const current = requestMeta.get(details.webContentsId) || {};
    requestMeta.set(details.webContentsId, {
      ...current,
      id: details.id,
      url: canonicalCacheUrl(details.url),
      method: String(details.method || current.method || 'GET').toUpperCase(),
      statusCode: details.statusCode,
    });
  });
}

function ownerWindowFor(contents) {
  return BrowserWindow.fromWebContents(contents) || toolWindow || mainWindow || undefined;
}

function wireClipboard(contents) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const command = process.platform === 'darwin' ? input.meta : input.control;
    if (!command || input.alt) return;
    const key = String(input.key || '').toLowerCase();
    if (key === 'c') {
      event.preventDefault();
      contents.copy();
    }
  });

  contents.on('context-menu', (_event, params) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' },
      );
    } else {
      template.push(
        { role: 'copy', enabled: Boolean(params.selectionText) && params.editFlags.canCopy },
        { role: 'selectAll' },
      );
    }
    Menu.buildFromTemplate(template).popup({ window: ownerWindowFor(contents) });
  });
}

function detach(view) {
  if (!view || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.contentView.removeChildView(view);
  } catch {
    // Already detached.
  }
}

function destroyView(view) {
  if (!view) return;
  detach(view);
  try {
    requestMeta.delete(view.webContents.id);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  } catch {
    // Best-effort teardown.
  }
}

function history(contents, action) {
  if (!contents || contents.isDestroyed()) return;
  const nav = contents.navigationHistory;
  if (action === 'back' && nav.canGoBack()) nav.goBack();
  else if (action === 'forward' && nav.canGoForward()) nav.goForward();
  else if (action === 'reload') contents.reload();
  else if (action === 'hard-reload') contents.reloadIgnoringCache();
}

async function syncTabCache(tab, url) {
  if (!isRemoteHttpUrl(url)) {
    tab.cache = null;
    tab.cacheAvailable = false;
    return null;
  }
  const cache = await cacheStore.metadataFor(url);
  if (cache && isFreshCache(cache, state.settings.cacheRetentionDays)) {
    tab.cache = cache;
    tab.cacheAvailable = true;
    return cache;
  }
  tab.cache = null;
  tab.cacheAvailable = false;
  return null;
}

async function savePuzzleCache(tab, contents) {
  if (!contents || contents.isDestroyed()) return false;
  const currentUrl = canonicalCacheUrl(contents.getURL());
  const request = requestMeta.get(contents.id);
  if (!isCacheableMainFrame({
    url: currentUrl,
    requestUrl: request?.url,
    method: request?.method,
    statusCode: request?.statusCode,
  })) return false;

  const file = cacheStore.pathFor(currentUrl);
  const temp = `${file}.tmp-${process.pid}-${Date.now()}.mhtml`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await contents.savePage(temp, 'MHTML');
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
  tab.cache = { path: file, cachedAt: Date.now(), sourceUrl: currentUrl };
  tab.cacheAvailable = true;
  await persist();
  return true;
}

async function openCache(tab, requestedUrl = tab.onlineUrl, method = 'GET') {
  const url = canonicalCacheUrl(requestedUrl);
  const cache = await cacheStore.metadataFor(url);
  if (!canUseOfflineCache({
    cache,
    url,
    method,
    retentionDays: state.settings.cacheRetentionDays,
  })) return false;
  const view = puzzleViews.get(tab.id);
  if (!view || view.webContents.isDestroyed()) return false;
  tab.offline = true;
  tab.cache = cache;
  tab.cacheAvailable = true;
  await view.webContents.loadURL(pathToFileURL(cache.path).href);
  await persist();
  return true;
}

async function handlePuzzleFinished(tab, contents) {
  const currentUrl = contents.getURL();
  if (!isRemoteHttpUrl(currentUrl) || tab.offline) return;
  await syncTabCache(tab, currentUrl);
  const request = requestMeta.get(contents.id);

  if (
    state.settings.autoOfflineFallback &&
    request?.method === 'GET' &&
    isServerFailureStatus(request.statusCode) &&
    await openCache(tab, currentUrl, request.method)
  ) return;

  await savePuzzleCache(tab, contents).catch((error) => {
    console.warn('Puzzle snapshot failed:', error.message);
  });
  broadcast();
}

async function handlePuzzleFailure(tab, contents, code, url, isMainFrame) {
  if (code === -3 || isMainFrame === false || !isRemoteHttpUrl(url)) return;
  const request = requestMeta.get(contents.id);
  const method = request?.url === canonicalCacheUrl(url) ? request.method : 'GET';
  if (state.settings.autoOfflineFallback && method === 'GET') {
    await openCache(tab, url, method).catch(() => false);
  }
}

function wireRemote(contents, metadata, kind) {
  wireClipboard(contents);
  contents.on('destroyed', () => requestMeta.delete(contents.id));

  contents.setWindowOpenHandler(({ url }) => {
    if (kind === 'puzzle' && isRemoteHttpUrl(url)) {
      queueMicrotask(() => createPuzzle(url).catch(console.error));
      return { action: 'deny' };
    }
    if (isRemoteHttpUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: prefs(),
        },
      };
    }
    return { action: 'deny' };
  });

  contents.on('did-create-window', (window) => wireClipboard(window.webContents));

  contents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
    if (kind !== 'puzzle' || !isMainFrame || !isRemoteHttpUrl(url)) return;
    metadata.url = url;
    metadata.onlineUrl = url;
    metadata.offline = false;
    metadata.cache = null;
    metadata.cacheAvailable = false;
    broadcast();
  });

  const update = (_event, url) => {
    if (kind === 'puzzle' && metadata.offline && url.startsWith('file:')) return;
    metadata.url = url;
    if (kind === 'puzzle' && isRemoteHttpUrl(url)) {
      metadata.onlineUrl = url;
      metadata.offline = false;
      syncTabCache(metadata, url).then(() => persist()).catch(console.error);
      return;
    }
    persist().catch(console.error);
  };
  contents.on('did-navigate', update);
  contents.on('did-navigate-in-page', update);
  contents.on('page-title-updated', (_event, title) => {
    metadata.title = title || metadata.title;
    persist().catch(console.error);
  });
  contents.on('did-start-loading', broadcast);
  contents.on('did-stop-loading', broadcast);

  if (kind === 'puzzle') {
    contents.on('did-finish-load', () => handlePuzzleFinished(metadata, contents).catch(console.error));
    contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
      handlePuzzleFailure(metadata, contents, code, url, isMainFrame).catch(console.error);
    });
  }
}

function createPuzzleView(tab) {
  const view = new WebContentsView({ webPreferences: prefs() });
  puzzleViews.set(tab.id, view);
  wireRemote(view.webContents, tab, 'puzzle');
  return view;
}

async function loadInitialPuzzle(tab, view) {
  if (tab.offline && isRemoteHttpUrl(tab.onlineUrl || tab.url)) {
    const opened = await openCache(tab, tab.onlineUrl || tab.url, 'GET').catch(() => false);
    if (opened) return;
    tab.offline = false;
  }
  await view.webContents.loadURL(normalizeUserUrl(tab.url)).catch(() => undefined);
}

function createCanvas() {
  canvasView = new WebContentsView({ webPreferences: prefs() });
  wireRemote(canvasView.webContents, ws().canvas, 'canvas');
  return canvasView;
}

function createToolView(tab) {
  const view = new WebContentsView({ webPreferences: prefs() });
  toolViews.set(tab.id, view);
  tab.sleeping = false;
  wireRemote(view.webContents, tab, 'tool');
  view.webContents.loadURL(normalizeUserUrl(tab.url)).catch(() => undefined);
  return view;
}

function activeToolView() {
  const tab = toolTab();
  if (!tab) return null;
  let view = toolViews.get(tab.id);
  if (!view && !ws().tools.poppedOut) view = createToolView(tab);
  return view;
}

function applyLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [width, height] = mainWindow.getContentSize();
  const dockVisible = ws().tools.dockVisible && !ws().tools.poppedOut && Boolean(toolTab());
  currentLayout = calculateLayout({
    width,
    height,
    splitRatio: state.settings.splitRatio,
    toolVisible: dockVisible,
    toolWidth: state.settings.toolDockWidth,
  });
  const puzzle = puzzleViews.get(puzzleTab().id);
  if (puzzle) puzzle.setBounds(currentLayout.puzzle);
  if (canvasView) canvasView.setBounds(currentLayout.canvas);
  for (const view of toolViews.values()) detach(view);
  if (dockVisible) {
    const view = activeToolView();
    if (view) {
      mainWindow.contentView.addChildView(view);
      view.setBounds(currentLayout.tool);
    }
  }
  broadcast();
}

function attachMain() {
  for (const view of puzzleViews.values()) detach(view);
  const puzzle = puzzleViews.get(puzzleTab().id);
  if (puzzle) mainWindow.contentView.addChildView(puzzle);
  if (canvasView) {
    detach(canvasView);
    mainWindow.contentView.addChildView(canvasView);
  }
  applyLayout();
}

function teardownWorkspaceViews() {
  for (const view of puzzleViews.values()) destroyView(view);
  puzzleViews.clear();
  for (const view of toolViews.values()) destroyView(view);
  toolViews.clear();
  destroyView(canvasView);
  canvasView = null;
  if (toolWindow && !toolWindow.isDestroyed()) toolWindow.destroy();
  toolWindow = null;
}

async function buildWorkspaceViews() {
  const loads = [];
  for (const tab of ws().puzzleTabs) {
    const view = createPuzzleView(tab);
    loads.push(loadInitialPuzzle(tab, view));
  }
  const canvas = createCanvas();
  loads.push(canvas.webContents.loadURL(normalizeUserUrl(ws().canvas.url)).catch(() => undefined));
  await Promise.all(loads);
  attachMain();
}

async function createPuzzle(url = 'about:blank') {
  const tab = newPuzzleTab(normalizeUserUrl(url));
  ws().puzzleTabs.push(tab);
  ws().activePuzzleTabId = tab.id;
  const view = createPuzzleView(tab);
  await view.webContents.loadURL(tab.url).catch(() => undefined);
  attachMain();
  await persist();
  return tab.id;
}

async function switchPuzzle(id) {
  if (!ws().puzzleTabs.some((tab) => tab.id === id)) return false;
  ws().activePuzzleTabId = id;
  attachMain();
  await persist();
  return true;
}

async function closePuzzle(id) {
  const tabs = ws().puzzleTabs;
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return false;
  if (tabs.length === 1) {
    const tab = tabs[0];
    Object.assign(tab, {
      url: 'about:blank',
      onlineUrl: 'about:blank',
      title: 'New Puzzle',
      offline: false,
      cache: null,
      cacheAvailable: false,
    });
    await puzzleViews.get(tab.id)?.webContents.loadURL('about:blank');
    await persist();
    return true;
  }
  const active = ws().activePuzzleTabId === id;
  const [tab] = tabs.splice(index, 1);
  destroyView(puzzleViews.get(tab.id));
  puzzleViews.delete(tab.id);
  if (active) ws().activePuzzleTabId = tabs[Math.min(index, tabs.length - 1)].id;
  attachMain();
  await persist();
  return true;
}

async function createTool(url = 'about:blank', title = 'New Tool') {
  const tab = newToolTab(normalizeUserUrl(url), title);
  ws().tools.tabs.push(tab);
  ws().tools.activeToolTabId = tab.id;
  ws().tools.dockVisible = true;
  if (ws().tools.poppedOut) await openToolPopout(tab);
  else createToolView(tab);
  applyLayout();
  await persist();
  return tab.id;
}

async function switchTool(id) {
  const target = ws().tools.tabs.find((tab) => tab.id === id);
  if (!target) return false;
  const old = toolTab();
  if (old) old.lastActiveAt = Date.now();
  ws().tools.activeToolTabId = id;
  target.lastActiveAt = Date.now();
  if (ws().tools.poppedOut) await openToolPopout(target);
  else activeToolView();
  applyLayout();
  await persist();
  return true;
}

async function closeTool(id) {
  const tabs = ws().tools.tabs;
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return false;
  const active = ws().tools.activeToolTabId === id;
  const [tab] = tabs.splice(index, 1);
  destroyView(toolViews.get(tab.id));
  toolViews.delete(tab.id);
  if (active) {
    ws().tools.activeToolTabId = tabs[Math.min(index, tabs.length - 1)]?.id || null;
    if (ws().tools.poppedOut) {
      if (toolTab()) await openToolPopout(toolTab());
      else closeToolWindow();
    }
  }
  if (!tabs.length) ws().tools.dockVisible = false;
  applyLayout();
  await persist();
  return true;
}

function closeToolWindow() {
  if (toolWindow && !toolWindow.isDestroyed()) {
    toolWindow.removeAllListeners('closed');
    toolWindow.destroy();
  }
  toolWindow = null;
  ws().tools.poppedOut = false;
}

async function openToolPopout(tab = toolTab()) {
  if (!tab) return false;
  for (const view of toolViews.values()) detach(view);
  destroyView(toolViews.get(tab.id));
  toolViews.delete(tab.id);
  if (toolWindow && !toolWindow.isDestroyed()) {
    toolWindow.removeAllListeners('closed');
    toolWindow.destroy();
  }
  toolWindow = new BrowserWindow({
    width: 420,
    height: 760,
    minWidth: 300,
    minHeight: 360,
    title: tab.title || 'Tool',
    alwaysOnTop: Boolean(state.settings.toolAlwaysOnTop),
    opacity: toolOpacity(state.settings.toolPopoutOpacity),
    autoHideMenuBar: true,
    webPreferences: prefs(),
  });
  wireClipboard(toolWindow.webContents);
  wireRemote(toolWindow.webContents, tab, 'tool');
  toolWindow.on('closed', () => {
    toolWindow = null;
    ws().tools.poppedOut = false;
    ws().tools.dockVisible = true;
    activeToolView();
    applyLayout();
    persist().catch(console.error);
  });
  ws().tools.poppedOut = true;
  ws().tools.dockVisible = false;
  tab.lastActiveAt = Date.now();
  await toolWindow.loadURL(normalizeUserUrl(tab.url)).catch(() => undefined);
  applyLayout();
  await persist();
  return true;
}

function sleepInactiveTools() {
  const active = toolTab();
  const activeVisible = ws().tools.dockVisible || ws().tools.poppedOut;
  let changed = false;
  for (const tab of ws().tools.tabs) {
    if (shouldSleepTool({
      lastActiveAt: tab.lastActiveAt,
      now: Date.now(),
      sleepMinutes: state.settings.toolSleepMinutes,
      isActive: tab.id === active?.id && activeVisible,
      poppedOut: ws().tools.poppedOut && tab.id === active?.id,
    })) {
      const view = toolViews.get(tab.id);
      if (view) {
        destroyView(view);
        toolViews.delete(tab.id);
      }
      if (!tab.sleeping) changed = true;
      tab.sleeping = true;
    }
  }
  if (changed) persist().catch(() => undefined);
}

function registerIpc() {
  handle('app:get-state', () => snapshot());
  handle('puzzle:new', (_event, url) => createPuzzle(url));
  handle('puzzle:switch', (_event, id) => switchPuzzle(id));
  handle('puzzle:close', (_event, id) => closePuzzle(id));
  handle('puzzle:navigate', async (_event, input) => {
    const tab = puzzleTab();
    const url = normalizeUserUrl(input);
    Object.assign(tab, { url, onlineUrl: url, offline: false, cache: null, cacheAvailable: false });
    await puzzleViews.get(tab.id).webContents.loadURL(url).catch(() => undefined);
    await persist();
  });
  handle('puzzle:history', (_event, action) => history(puzzleViews.get(puzzleTab().id)?.webContents, action));
  handle('puzzle:toggle-cache', async () => {
    const tab = puzzleTab();
    if (tab.offline) {
      tab.offline = false;
      await puzzleViews.get(tab.id).webContents.loadURL(normalizeUserUrl(tab.onlineUrl)).catch(() => undefined);
      await persist();
      return 'live';
    }
    return await openCache(tab, tab.onlineUrl, 'GET') ? 'cache' : 'missing';
  });
  handle('puzzle:refresh-cache', () => savePuzzleCache(puzzleTab(), puzzleViews.get(puzzleTab().id).webContents));

  handle('canvas:navigate', async (_event, input) => {
    const url = normalizeUserUrl(input);
    ws().canvas.url = url;
    await canvasView.webContents.loadURL(url).catch(() => undefined);
    await persist();
  });
  handle('canvas:history', (_event, action) => history(canvasView?.webContents, action));

  handle('tool:toggle-dock', async () => {
    if (!toolTab()) await createTool();
    else {
      if (ws().tools.poppedOut) closeToolWindow();
      const current = toolTab();
      if (current) current.lastActiveAt = Date.now();
      ws().tools.dockVisible = !ws().tools.dockVisible;
    }
    applyLayout();
    await persist();
  });
  handle('tool:new', (_event, url, title) => createTool(url, title));
  handle('tool:switch', (_event, id) => switchTool(id));
  handle('tool:close', (_event, id) => closeTool(id));
  handle('tool:navigate', async (_event, input) => {
    const tab = toolTab();
    if (!tab) return false;
    const url = normalizeUserUrl(input);
    tab.url = url;
    tab.lastActiveAt = Date.now();
    const contents = ws().tools.poppedOut ? toolWindow?.webContents : activeToolView()?.webContents;
    await contents?.loadURL(url).catch(() => undefined);
    await persist();
    return true;
  });
  handle('tool:history', (_event, action) => history(ws().tools.poppedOut ? toolWindow?.webContents : activeToolView()?.webContents, action));
  handle('tool:popout', () => openToolPopout());
  handle('tool:dock', async () => {
    closeToolWindow();
    ws().tools.dockVisible = true;
    const current = toolTab();
    if (current) current.lastActiveAt = Date.now();
    activeToolView();
    applyLayout();
    await persist();
  });
  handle('tool:favorite', async () => {
    const tab = toolTab();
    if (!tab || !isRemoteHttpUrl(tab.url)) return false;
    if (!ws().tools.favorites.some((favorite) => favorite.url === tab.url)) {
      ws().tools.favorites.push({ id: `favorite-${Date.now()}`, name: tab.title || tab.url, url: tab.url });
    }
    await persist();
    return true;
  });
  handle('tool:open-favorite', (_event, id) => {
    const favorite = ws().tools.favorites.find((value) => value.id === id);
    return favorite ? createTool(favorite.url, favorite.name) : false;
  });
  handle('tool:remove-favorite', async (_event, id) => {
    ws().tools.favorites = ws().tools.favorites.filter((favorite) => favorite.id !== id);
    await persist();
  });

  handle('layout:set-split', async (_event, ratio) => {
    state.settings.splitRatio = Math.max(0.1, Math.min(0.9, Number(ratio) || 0.5));
    applyLayout();
    await persist();
  });
  handle('layout:set-tool-width', async (_event, width) => {
    state.settings.toolDockWidth = Math.max(260, Math.min(560, Number(width) || 360));
    applyLayout();
    await persist();
  });
  handle('settings:update', async (_event, patch) => {
    if (Object.hasOwn(patch, 'toolPopoutOpacity')) state.settings.toolPopoutOpacity = toolOpacity(patch.toolPopoutOpacity);
    if (Object.hasOwn(patch, 'toolAlwaysOnTop')) state.settings.toolAlwaysOnTop = Boolean(patch.toolAlwaysOnTop);
    if (Object.hasOwn(patch, 'toolSleepMinutes')) state.settings.toolSleepMinutes = Math.max(1, Math.min(120, Number(patch.toolSleepMinutes) || 5));
    if (Object.hasOwn(patch, 'cacheRetentionDays')) state.settings.cacheRetentionDays = Math.max(1, Math.min(90, Number(patch.cacheRetentionDays) || 7));
    if (Object.hasOwn(patch, 'autoOfflineFallback')) state.settings.autoOfflineFallback = Boolean(patch.autoOfflineFallback);
    if (toolWindow && !toolWindow.isDestroyed()) {
      toolWindow.setOpacity(toolOpacity(state.settings.toolPopoutOpacity));
      toolWindow.setAlwaysOnTop(Boolean(state.settings.toolAlwaysOnTop));
    }
    await cacheStore.clean(state.settings.cacheRetentionDays);
    for (const tab of ws().puzzleTabs) await syncTabCache(tab, tab.onlineUrl || tab.url);
    await persist();
  });

  handle('data:choose-location', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose parent folder for Puzzle Hunt Workbench data',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { changed: false };
    try {
      return planDataMigration({
        bootstrapFile: dataPaths.bootstrapFile,
        currentDataRoot: app.getPath('userData'),
        targetParent: result.filePaths[0],
      });
    } catch (error) {
      return { changed: false, error: error.message };
    }
  });
  handle('app:restart', async () => {
    await prepareQuit();
    app.relaunch();
    quitPrepared = true;
    allowMainDestroy = true;
    app.quit();
    return true;
  });

  handle('workspace:create', async (_event, name) => {
    teardownWorkspaceViews();
    createWorkspaceInState(state, name);
    await buildWorkspaceViews();
    await persist();
    return state.activeWorkspaceId;
  });
  handle('workspace:switch', async (_event, id) => {
    if (!state.workspaces[id] || id === state.activeWorkspaceId) return false;
    teardownWorkspaceViews();
    state.activeWorkspaceId = id;
    await buildWorkspaceViews();
    await persist();
    return true;
  });
  handle('workspace:rename', async (_event, id, name) => {
    const ok = renameWorkspace(state, id, name);
    if (ok) await persist();
    return ok;
  });
  handle('workspace:delete', async (_event, id) => {
    const wasActive = id === state.activeWorkspaceId;
    if (wasActive) teardownWorkspaceViews();
    const ok = deleteWorkspaceFromState(state, id);
    if (ok && wasActive) await buildWorkspaceViews();
    if (ok) await persist();
    return ok;
  });
}

async function flushBrowserStorage() {
  if (!sharedSession) return;
  await sharedSession.cookies.flushStore().catch(() => undefined);
  sharedSession.flushStorageData();
}

async function saveWindowAndSession() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [width, height] = mainWindow.getSize();
    Object.assign(state.window, { width, height });
  }
  await stateStore.save(state);
  await flushBrowserStorage();
}

function prepareQuit() {
  if (!quitPreparation) {
    quitPreparation = saveWindowAndSession().catch((error) => {
      console.error('Failed to persist shutdown state:', error);
    });
  }
  return quitPreparation;
}

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  allowMainDestroy = false;
  mainWindow = new BrowserWindow({
    width: state.window.width,
    height: state.window.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Puzzle Hunt Workbench',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  wireClipboard(mainWindow.webContents);
  await mainWindow.loadFile(LOCAL_UI_FILE);
  await buildWorkspaceViews();

  mainWindow.on('resize', applyLayout);
  mainWindow.on('maximize', () => {
    state.window.maximized = true;
    stateStore.save(state).catch(console.error);
  });
  mainWindow.on('unmaximize', () => {
    state.window.maximized = false;
    stateStore.save(state).catch(console.error);
  });
  mainWindow.on('close', (event) => {
    if (allowMainDestroy) return;
    event.preventDefault();
    allowMainDestroy = true;
    saveWindowAndSession().finally(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    });
  });
  mainWindow.on('closed', () => {
    teardownWorkspaceViews();
    mainWindow = null;
    allowMainDestroy = false;
  });
  mainWindow.once('ready-to-show', () => {
    if (state.window.maximized) mainWindow.maximize();
    if (process.env.PHW_SMOKE_TEST !== '1') mainWindow.show();
    applyLayout();
  });
  return mainWindow;
}

app.whenReady().then(async () => {
  stateStore = new StateStore(path.join(app.getPath('userData'), 'state.json'));
  state = await stateStore.load();
  cacheStore = new CacheStore(path.join(app.getPath('userData'), 'puzzle-cache'));
  await cacheStore.clean(state.settings.cacheRetentionDays);
  configureSession();
  registerIpc();
  await createMainWindow();
  sleepTimer = setInterval(sleepInactiveTools, 30000);

  if (process.env.PHW_SMOKE_TEST === '1') {
    const { runSmokeTest } = require('./smoke-test');
    await runSmokeTest({ browserSession: sharedSession, dataPaths });
    await prepareQuit();
    quitPrepared = true;
    allowMainDestroy = true;
    app.exit(0);
  }
}).catch((error) => {
  console.error(error);
  if (process.env.PHW_SMOKE_TEST === '1') app.exit(1);
  else app.quit();
});

app.on('activate', () => {
  if (shouldRecreateMainWindowOnActivate(Boolean(mainWindow && !mainWindow.isDestroyed()))) {
    quitPreparation = null;
    createMainWindow().catch(console.error);
  }
});

app.on('window-all-closed', () => {
  if (shouldQuitWhenAllWindowsClosed(process.platform)) app.quit();
});

app.on('before-quit', (event) => {
  if (sleepTimer) clearInterval(sleepTimer);
  if (quitPrepared) return;
  event.preventDefault();
  prepareQuit().finally(() => {
    quitPrepared = true;
    allowMainDestroy = true;
    app.quit();
  });
});
