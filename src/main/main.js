'use strict';

const { app, BrowserWindow, ipcMain, powerMonitor, Menu, nativeTheme } = require('electron');
const path = require('path');
const os = require('os');

const i18n = require('./i18n');
const { DEFAULT_SETTINGS, STRICTNESS, sanitizeSettings } = require('./defaults');
const { JsonFile, deepMerge } = require('./store');
const { Stats } = require('./stats');
const { Scheduler, MIN } = require('./scheduler');
const { TrayController } = require('./tray');
const { WindowManager } = require('./windows');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const dev = !app.isPackaged || process.argv.includes('--dev');

// Separate profile for testing next to a real installation: ATEM_PROFILE=test
if (process.env.ATEM_PROFILE) {
  app.setPath('userData', path.join(app.getPath('appData'), `Atem-${process.env.ATEM_PROFILE}`));
}

let settingsStore;
let stats;
let scheduler;
let windows;
let tray;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Launching Atem again opens the settings; `Atem --quit` ends the running instance (handy for updates).
  app.on('second-instance', (_e, argv) => (argv.includes('--quit') ? app.quit() : windows?.openSettings()));
  app.on('activate', () => windows?.openSettings()); // macOS: app icon clicked while running
  app.on('window-all-closed', () => {}); // live on in the tray
  app.on('before-quit', shutdown);
  app.whenReady().then(boot);
}

function boot() {
  if (isMac) app.dock?.hide();
  if (isWin) app.setAppUserModelId('ch.chriggi.atem');

  const userData = app.getPath('userData');
  settingsStore = new JsonFile(path.join(userData, 'settings.json'), DEFAULT_SETTINGS);
  settingsStore.data = sanitizeSettings(settingsStore.data);
  const firstRun = !settingsStore.existed;
  if (firstRun) {
    settingsStore.save({ immediate: true });
  } else {
    // Installs from before themes and languages existed keep the look and language they had.
    const { stored } = settingsStore;
    if (!('theme' in stored)) settingsStore.data.theme = 'dark';
    if (!('language' in stored)) settingsStore.data.language = 'de';
    settingsStore.save();
  }
  stats = new Stats(path.join(userData, 'stats.json'));

  nativeTheme.themeSource = settingsStore.data.theme;
  i18n.setLanguage(settingsStore.data.language, app.getLocale());
  Menu.setApplicationMenu(isMac ? macMenu() : null);

  const getSettings = () => settingsStore.data;
  scheduler = new Scheduler({ getSettings, getIdleSeconds: () => powerMonitor.getSystemIdleTime(), stats });
  windows = new WindowManager({
    dev,
    getState: () => scheduler.snapshot(),
    onSettingsClosed: () => {
      // The first time the window closes, show where Atem keeps running.
      if (quitting || getSettings().onboarded) return;
      updateSettings({ onboarded: true });
      windows.showIsland({ kind: 'tray-hint', platform: process.platform });
    },
    onBreakClosed: () => {
      if (windows.breakInfo?.preview || getSettings().strictness === 'gentle') runAction('skip');
    },
    onBreakCrash: () => {
      // Never leave a broken overlay covering the screen.
      windows.closeBreak({ immediate: true });
      scheduler.skipBreak();
    },
  });
  tray = new TrayController({ getSettings, onClick: (bounds) => windows.togglePopover(bounds), onAction: runAction });

  wireScheduler();
  registerIpc();
  // With theme "system", an OS switch between light and dark must reach the window chrome too.
  nativeTheme.on('updated', () => windows.themeChanged());
  powerMonitor.on('lock-screen', () => scheduler.setLocked('screen', true));
  powerMonitor.on('unlock-screen', () => scheduler.setLocked('screen', false));
  powerMonitor.on('suspend', () => scheduler.setLocked('sleep', true));
  powerMonitor.on('resume', () => scheduler.setLocked('sleep', false));

  applyAutostart(getSettings().autostart, { force: firstRun });
  // Once more a little later: an updater that is still cleaning up must not leave us without autostart.
  setTimeout(() => applyAutostart(getSettings().autostart), 30_000);
  scheduler.start();
  windows.preparePopover();

  if (firstRun || !launchedHidden()) windows.openSettings();
  else windows.showIsland({ kind: 'hello', nextBreakAt: scheduler.nextBreakAt });

  if (dev && process.env.ATEM_SELFTEST) {
    require('./selftest').run({ dir: process.env.ATEM_SELFTEST, windows, scheduler, tray, runAction, updateSettings });
  }
  if (dev && process.argv.includes('--preview-break')) setTimeout(() => runAction('preview-break', 20), 1500);
}

/** Started by the OS at login? Then stay quietly in the tray. */
function launchedHidden() {
  if (process.argv.includes('--hidden')) return true;
  if (isMac) {
    try {
      if (app.getLoginItemSettings().wasOpenedAtLogin) return true;
    } catch {
      /* not available on newer macOS */
    }
    // macOS 13+ no longer reports login launches: a fresh session is a very good hint.
    return os.uptime() < 240;
  }
  return false;
}

/**
 * Keeps the login item in line with the "start with your computer" setting.
 * `force` (first run, or the user flipped the switch in Atem) always applies it. Otherwise Atem only
 * restores an entry that has gone missing (e.g. during an update) and respects choices made in the
 * OS: switched off in Task Manager's startup tab, or removed from macOS login items.
 */
function applyAutostart(enabled, { force = false } = {}) {
  // In development this would register the bare Electron binary – only real builds autostart.
  // Test profiles (ATEM_PROFILE) never touch the login items either.
  if (!app.isPackaged || process.env.ATEM_PROFILE) return;
  const target = isWin ? { path: process.execPath, args: ['--hidden'] } : {};
  if (!force) {
    if (isMac) return;
    if (enabled && app.getLoginItemSettings(target).openAtLogin) return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, ...target });
}

function wireScheduler() {
  scheduler.on('state', (snap) => {
    tray.update(snap);
    windows.broadcastState(snap);
  });
  scheduler.on('warn', (warning) => windows.showIsland({ kind: 'warn', ...warning }));
  scheduler.on('warn-cancel', () => windows.closeIsland('warn'));
  scheduler.on('break-start', (info) => {
    if (info.fullscreen) windows.openBreak(info);
    else windows.showIsland({ kind: 'micro', ...info });
  });
  scheduler.on('break-finished', (info) => windows.broadcast('event', { type: 'break:finished', info }));
  scheduler.on('break-end', ({ kind, reason }) => {
    const open = windows.breakInfo;
    if (open && !open.preview) {
      // A finished full-screen micro break keeps its "Danke." on screen for a moment.
      if (kind === 'micro' && reason === 'done') setTimeout(() => windows.breakInfo === open && windows.closeBreak(), 2200);
      else windows.closeBreak();
    }
    // A finished or skipped capsule animates itself out; anything else closes it right away.
    if (kind === 'micro' && (reason === 'paused' || reason === 'snoozed')) windows.closeIsland('micro');
  });
  scheduler.on('idle-start', () => windows.closeIsland('warn'));
  scheduler.on('idle-end', ({ natural, awayMs }) => {
    if (natural) windows.showIsland({ kind: 'welcome', awayMs });
  });
  scheduler.on('paused', ({ until }) => windows.showIsland({ kind: 'paused', until }));
  scheduler.on('resumed', () => windows.showIsland({ kind: 'resumed', nextBreakAt: scheduler.nextBreakAt }));
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settingsStore.data);
  ipcMain.handle('settings:set', (_e, patch) => updateSettings(patch));
  ipcMain.handle('state:get', () => scheduler.snapshot());
  ipcMain.handle('stats:get', () => stats.summary());
  ipcMain.handle('break:get', () => windows.breakInfo);
  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    version: app.getVersion(),
    dev,
    packaged: app.isPackaged,
    strictness: STRICTNESS,
  }));
  ipcMain.handle('action', (e, name, payload) => runAction(name, payload, BrowserWindow.fromWebContents(e.sender)));
}

function updateSettings(patch) {
  const prev = settingsStore.data;
  const next = sanitizeSettings(deepMerge(prev, patch || {}));
  settingsStore.data = next;
  settingsStore.save();
  if (prev.autostart !== next.autostart) applyAutostart(next.autostart, { force: true });
  if (prev.theme !== next.theme) {
    nativeTheme.themeSource = next.theme;
    windows.themeChanged();
  }
  if (prev.language !== next.language && i18n.setLanguage(next.language, app.getLocale())) {
    tray.refresh();
    if (isMac) Menu.setApplicationMenu(macMenu());
  }
  scheduler.settingsChanged(prev, next);
  windows.broadcast('settings', next);
  return next;
}

/** A break that only shows what a break looks like – it never touches the schedule or stats. */
function previewInfo(kind, seconds) {
  const s = settingsStore.data;
  const rules = STRICTNESS[s.strictness];
  const now = Date.now();
  const duration = Math.round((seconds || (kind === 'long' ? 60 : s.micro.durationSec)) * 1000);
  return {
    kind,
    preview: true,
    manual: true,
    startedAt: now,
    endsAt: now + duration,
    duration,
    finished: false,
    fullscreen: kind === 'long' || s.micro.style === 'fullscreen',
    strictness: s.strictness,
    skip: rules.skip,
    holdMs: rules.holdMs,
    escSkips: rules.escSkips,
    snoozesLeft: 0,
    snoozeMin: s.snooze.minutes,
  };
}

function runAction(name, payload, senderWin) {
  const preview = !!windows.breakInfo?.preview;
  switch (name) {
    case 'break-now':
      windows.hidePopover();
      scheduler.startBreak('long', { manual: true });
      return true;
    case 'micro-now':
      windows.hidePopover();
      scheduler.startBreak('micro', { manual: true });
      return true;
    case 'preview-break':
      windows.openBreak(previewInfo('long', payload));
      return true;
    case 'preview-micro': {
      const info = previewInfo('micro', payload);
      if (info.fullscreen) windows.openBreak(info);
      else windows.showIsland({ kind: 'micro', ...info });
      return true;
    }
    case 'skip':
      if (preview) windows.closeBreak();
      else scheduler.skipBreak();
      return true;
    case 'complete':
      if (preview) windows.closeBreak();
      else scheduler.completeBreak();
      return true;
    case 'snooze':
      if (preview) {
        windows.closeBreak();
        return true;
      }
      return scheduler.snooze();
    case 'skip-micro':
      if (!payload?.preview && scheduler.current?.kind === 'micro') scheduler.skipBreak();
      return true;
    case 'pause': {
      windows.hidePopover();
      if (payload === 'tomorrow') {
        const until = new Date();
        until.setDate(until.getDate() + 1);
        until.setHours(6, 0, 0, 0);
        scheduler.pauseUntil(until.getTime());
      } else {
        scheduler.pause(Math.max(1, Number(payload) || 30) * MIN);
      }
      return true;
    }
    case 'resume':
      scheduler.resume();
      return true;
    case 'open-settings':
      windows.hidePopover();
      windows.openSettings(typeof payload === 'string' ? payload : undefined);
      return true;
    case 'island-mouse':
      windows.islandMouse(!!payload);
      return true;
    case 'island-done':
      windows.closeIsland();
      return true;
    case 'popover-hide':
      windows.hidePopover();
      return true;
    case 'window-minimize':
      senderWin?.minimize();
      return true;
    case 'window-maximize':
      if (senderWin?.isMaximized()) senderWin.unmaximize();
      else senderWin?.maximize();
      return true;
    case 'window-close':
      senderWin?.close();
      return true;
    case 'quit':
      app.quit();
      return true;
    default:
      console.warn('[atem] unknown action', name);
      return false;
  }
}

function shutdown() {
  quitting = true;
  scheduler?.stop();
  stats?.flush();
  settingsStore?.flush();
  windows?.closeBreak({ immediate: true });
}

function macMenu() {
  const { t } = i18n;
  return Menu.buildFromTemplate([
    {
      label: 'Atem',
      submenu: [
        { role: 'about', label: t('menu.about') },
        { type: 'separator' },
        { label: t('menu.settings'), accelerator: 'Cmd+,', click: () => windows?.openSettings() },
        { type: 'separator' },
        { role: 'hide', label: t('menu.hide') },
        { type: 'separator' },
        { label: t('menu.quit'), accelerator: 'Cmd+Q', click: () => app.quit() },
      ],
    },
    { label: t('menu.edit'), submenu: [{ role: 'copy', label: t('menu.copy') }, { role: 'selectAll', label: t('menu.selectAll') }] },
    { label: t('menu.window'), submenu: [{ role: 'minimize', label: t('menu.minimize') }, { role: 'close', label: t('menu.close') }] },
  ]);
}
