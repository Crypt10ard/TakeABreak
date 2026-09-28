'use strict';

const { BrowserWindow, screen, app, shell } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';
const RENDERER_DIR = path.join(__dirname, '..', '..', 'dist', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

const POPOVER = { width: 380, height: 540 };
const ISLAND = { width: 640, height: 190 };

const WINDOW_ICON = path.join(__dirname, '..', '..', 'build', 'icon-win.png');

const pageFile = (name) => path.join(RENDERER_DIR, name, 'index.html');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const alive = (win) => win && !win.isDestroyed();

function webPreferences(extra = {}) {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    ...extra,
  };
}

/** Frameless, transparent, always-on-top window used for overlays, the island and the popover. */
function floatingWindow(opts) {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    roundedCorners: false,
    ...opts,
  });
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  return win;
}

/**
 * Owns every window of the app:
 *   settings – the big scroll-driven settings experience (created on demand, destroyed on close)
 *   popover  – small panel next to the tray icon (kept alive for instant opening)
 *   island   – floating capsule at the top of the screen (warnings, micro breaks, notices)
 *   break    – one full-screen overlay per display during a break
 */
class WindowManager {
  constructor({ dev, getState, onSettingsClosed, onBreakClosed, onBreakCrash }) {
    this.dev = dev;
    this.getState = getState;
    this.onSettingsClosed = onSettingsClosed;
    this.onBreakClosed = onBreakClosed;
    this.onBreakCrash = onBreakCrash;
    this.windowedBreaks = process.env.ATEM_WINDOWED === '1';
    this.settings = null;
    this.popover = null;
    this.popoverHiddenAt = 0;
    this.island = null;
    this.islandPayload = null;
    this.breakWins = [];
    this.breakInfo = null;
  }

  all() {
    return [this.settings, this.popover, this.island, ...this.breakWins].filter(alive);
  }

  broadcast(channel, payload) {
    for (const win of this.all()) win.webContents.send(channel, payload);
  }

  /** The per-second state tick only goes to windows someone can see – hidden ones stay asleep. */
  broadcastState(snapshot) {
    for (const win of this.all()) {
      if (win.isVisible() && !win.isMinimized()) win.webContents.send('state', snapshot);
    }
  }

  #harden(win) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    if (this.dev) {
      win.webContents.on('before-input-event', (_e, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
      });
      // Surface renderer problems in the terminal while developing.
      win.webContents.on('console-message', (e) => {
        if (e.level === 'error' || e.level === 'warning') console.log(`[renderer:${e.level}]`, e.message);
      });
    }
  }

  /* ---------------------------------------------------------------- settings */

  openSettings(section) {
    if (alive(this.settings)) {
      const win = this.settings;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      if (section) win.webContents.send('event', { type: 'goto', section });
      return win;
    }

    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const width = Math.min(1280, workArea.width - 60);
    const height = Math.min(840, workArea.height - 40);
    const win = new BrowserWindow({
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + (workArea.height - height) / 2),
      width,
      height,
      minWidth: 960,
      minHeight: 640,
      show: false,
      title: 'Atem',
      backgroundColor: '#08090b',
      ...(isMac ? {} : { icon: WINDOW_ICON }),
      ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 } } : { frame: false }),
      webPreferences: webPreferences(),
    });
    this.#harden(win);
    win.loadFile(pageFile('settings'), { query: { platform: process.platform, section: section || '' } });
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
    win.on('maximize', () => win.webContents.send('event', { type: 'window', maximized: true }));
    win.on('unmaximize', () => win.webContents.send('event', { type: 'window', maximized: false }));
    win.on('closed', () => {
      if (this.settings === win) this.settings = null;
      if (isMac && !alive(this.settings)) app.dock?.hide();
      this.onSettingsClosed?.();
    });
    if (isMac) app.dock?.show();
    this.settings = win;
    return win;
  }

  /* ----------------------------------------------------------------- popover */

  preparePopover() {
    if (alive(this.popover)) return this.popover;
    // Preloaded for instant opening, but it must not paint (or animate) while nobody sees it.
    const win = floatingWindow({ ...POPOVER, paintWhenInitiallyHidden: false, webPreferences: webPreferences() });
    this.#harden(win);
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.loadFile(pageFile('popover'), { query: { platform: process.platform } });
    win.on('blur', () => {
      if (!win.webContents.isDevToolsOpened()) this.hidePopover();
    });
    win.on('closed', () => {
      if (this.popover === win) this.popover = null;
    });
    this.popover = win;
    return win;
  }

  togglePopover(trayBounds) {
    const win = this.preparePopover();
    if (win.isVisible()) return this.hidePopover();
    // Clicking the tray icon while the popover is open blurs (hides) it first – don't reopen it.
    if (Date.now() - this.popoverHiddenAt < 300) return;
    this.#positionPopover(win, trayBounds);
    if (this.getState) win.webContents.send('state', this.getState());
    win.webContents.send('event', { type: 'popover:show' });
    win.show();
    win.focus();
  }

  hidePopover() {
    if (!alive(this.popover) || !this.popover.isVisible()) return;
    this.popover.hide();
    this.popoverHiddenAt = Date.now();
  }

  #positionPopover(win, trayBounds) {
    const [w, h] = win.getSize();
    const hasTray = trayBounds && trayBounds.width > 0;
    const anchor = hasTray
      ? { x: trayBounds.x + trayBounds.width / 2, y: trayBounds.y + trayBounds.height / 2 }
      : screen.getCursorScreenPoint();
    const { workArea: wa, bounds: b } = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) });
    const gap = 2; // the page itself has transparent padding around the card
    let x = Math.round(anchor.x - w / 2);
    let y;
    if (wa.y > b.y) {
      y = wa.y + gap; // bar on top: macOS menu bar or a top taskbar
    } else if (wa.x > b.x) {
      x = wa.x + gap; // taskbar on the left
      y = Math.round(anchor.y - h / 2);
    } else if (wa.x + wa.width < b.x + b.width) {
      x = wa.x + wa.width - w - gap; // taskbar on the right
      y = Math.round(anchor.y - h / 2);
    } else {
      y = wa.y + wa.height - h - gap; // default Windows: taskbar at the bottom
    }
    x = clamp(x, wa.x + gap, wa.x + wa.width - w - gap);
    y = clamp(y, wa.y + gap, wa.y + wa.height - h - gap);
    win.setPosition(x, y, false);
  }

  /* ------------------------------------------------------------------ island */

  showIsland(payload) {
    this.islandPayload = payload;
    if (alive(this.island)) {
      if (!this.island.webContents.isLoading()) this.island.webContents.send('event', { type: 'island', ...payload });
      return;
    }
    const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const win = floatingWindow({
      ...ISLAND,
      x: Math.round(wa.x + (wa.width - ISLAND.width) / 2),
      y: wa.y + (isMac ? 2 : 6),
      focusable: false,
      acceptFirstMouse: true,
      webPreferences: webPreferences({ backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }),
    });
    this.#harden(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    // Click-through until the pointer is over the capsule itself (the renderer tells us).
    win.setIgnoreMouseEvents(true, { forward: true });
    win.loadFile(pageFile('island'), { query: { platform: process.platform } });
    win.webContents.once('did-finish-load', () => {
      if (!alive(win)) return;
      win.webContents.send('event', { type: 'island', ...this.islandPayload });
      win.showInactive();
    });
    win.on('closed', () => {
      if (this.island === win) this.island = null;
    });
    this.island = win;
  }

  islandKind() {
    return alive(this.island) ? this.islandPayload?.kind : null;
  }

  closeIsland(onlyKind) {
    if (!alive(this.island)) return;
    if (onlyKind && this.islandPayload?.kind !== onlyKind) return;
    this.island.destroy();
    this.island = null;
  }

  islandMouse(interactive) {
    if (alive(this.island)) this.island.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  /* ------------------------------------------------------------------- break */

  openBreak(info) {
    this.closeBreak({ immediate: true });
    this.closeIsland();
    this.hidePopover();
    this.breakInfo = info;

    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const displays = this.windowedBreaks ? [cursorDisplay] : screen.getAllDisplays();

    this.breakWins = displays.map((display) => {
      const role = display.id === cursorDisplay.id ? 'primary' : 'secondary';
      const bounds = this.windowedBreaks
        ? { x: display.workArea.x + 80, y: display.workArea.y + 60, width: 1280, height: 800 }
        : display.bounds;
      const win = floatingWindow({
        ...bounds,
        enableLargerThanScreen: true,
        focusable: role === 'primary',
        acceptFirstMouse: true,
        alwaysOnTop: !this.windowedBreaks,
        skipTaskbar: !this.windowedBreaks,
        webPreferences: webPreferences({ backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }),
      });
      this.#harden(win);
      if (!this.windowedBreaks) win.setAlwaysOnTop(true, 'screen-saver');
      win.loadFile(pageFile('break'), { query: { role, platform: process.platform } });
      win.webContents.once('did-finish-load', () => {
        if (!alive(win)) return;
        win.setBounds(bounds);
        if (role === 'primary') {
          win.show();
          win.focus();
        } else {
          win.showInactive();
        }
        // Above everything that is also "always on top" – including the taskbar.
        if (!this.windowedBreaks) win.moveTop();
      });
      // Alt+F4 / Cmd+W: the break decides (gentle mode skips, otherwise nothing happens).
      win.on('close', (e) => {
        e.preventDefault();
        this.onBreakClosed?.();
      });
      win.webContents.on('render-process-gone', () => this.onBreakCrash?.());
      win.on('unresponsive', () => this.onBreakCrash?.());
      return win;
    });
  }

  closeBreak({ immediate = false } = {}) {
    const wins = this.breakWins;
    this.breakWins = [];
    this.breakInfo = null;
    for (const win of wins) {
      if (!alive(win)) continue;
      if (immediate) {
        win.destroy();
        continue;
      }
      // Let the page fade out; clicks already fall through to the desktop.
      win.setIgnoreMouseEvents(true);
      win.webContents.send('event', { type: 'break:closing' });
      setTimeout(() => alive(win) && win.destroy(), 900);
    }
  }
}

module.exports = { WindowManager };
