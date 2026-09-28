'use strict';

const { Tray, Menu, nativeImage, nativeTheme } = require('electron');
const { execFile } = require('child_process');
const { renderIcon } = require('./tray-icon');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

const SOON_MS = 5 * 60_000;
const STEPS = 48; // ring resolution: re-render only when the arc visibly changes
const COLORS = {
  dark: { ink: '#FFFFFF', soon: '#FFB27A', brk: '#9BE7C4' },
  light: { ink: '#1C1C1F', soon: '#D9652B', brk: '#1F9D6B' },
};

const minutesLeft = (ms) => Math.max(0, Math.ceil(ms / 60_000));

function formatDuration(ms) {
  const m = minutesLeft(ms);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

const clock = (ts) => new Date(ts).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

/** Tray / menu bar icon with a live progress ring, tooltip and context menu. */
class TrayController {
  constructor({ getSettings, onClick, onAction }) {
    this.getSettings = getSettings;
    this.onAction = onAction;
    this.lightTaskbar = false;
    this.snap = null;
    this.iconKey = '';
    this.tip = '';
    this.title = '';

    this.tray = new Tray(this.#image('work', 0));
    this.tray.setToolTip('Atem');
    if (isMac) this.tray.setIgnoreDoubleClickEvents(true);
    this.tray.on('click', () => onClick(this.tray.getBounds()));
    this.tray.on('right-click', () => this.tray.popUpContextMenu(this.#menu()));

    this.#detectTaskbarTheme();
    nativeTheme.on('updated', () => this.#detectTaskbarTheme());
  }

  /** Windows lets the taskbar be light while apps are dark (and vice versa), so ask the registry. */
  #detectTaskbarTheme() {
    if (!isWin) return;
    execFile(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme'],
      { windowsHide: true },
      (err, stdout) => {
        const light = !err && /SystemUsesLightTheme\s+REG_DWORD\s+0x1\b/i.test(stdout);
        if (light === this.lightTaskbar) return;
        this.lightTaskbar = light;
        this.iconKey = '';
        if (this.snap) this.update(this.snap);
      },
    );
  }

  #image(state, progress) {
    const img = nativeImage.createEmpty();
    if (isMac) {
      // Template image: macOS tints it to match the menu bar.
      const o = { state, progress, ink: '#000000', accent: '#000000' };
      img.addRepresentation({ scaleFactor: 1, buffer: renderIcon(18, o) });
      img.addRepresentation({ scaleFactor: 2, buffer: renderIcon(36, o) });
      img.setTemplateImage(true);
      return img;
    }
    const c = this.lightTaskbar ? COLORS.light : COLORS.dark;
    const o = { state, progress, ink: c.ink, accent: state === 'break' ? c.brk : c.soon };
    for (const [scaleFactor, px] of [[1, 16], [1.25, 20], [1.5, 24], [2, 32]]) {
      img.addRepresentation({ scaleFactor, buffer: renderIcon(px, o) });
    }
    return img;
  }

  update(snap) {
    this.snap = snap;
    const now = Date.now();
    let state = 'work';
    let progress = 0;
    let tip;
    let title = '';

    switch (snap.mode) {
      case 'break':
        state = 'break';
        tip = snap.break?.kind === 'micro' ? 'Atem · Mikropause' : 'Atem · Pause läuft';
        break;
      case 'paused':
        state = 'paused';
        tip = `Atem · pausiert bis ${clock(snap.pausedUntil)}`;
        break;
      case 'idle':
        state = 'idle';
        tip = 'Atem · du bist gerade weg';
        break;
      default: {
        const left = snap.nextBreakAt - now;
        const total = snap.nextBreakAt - snap.workStart;
        progress = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
        state = left <= SOON_MS ? 'soon' : 'work';
        tip = `Atem · nächste Pause in ${formatDuration(left)}`;
        if (this.getSettings().trayCountdown) title = ` ${minutesLeft(left)}′`;
      }
    }

    const step = Math.round(progress * STEPS);
    const key = `${state}:${step}:${this.lightTaskbar}`;
    if (key !== this.iconKey) {
      this.iconKey = key;
      this.tray.setImage(this.#image(state, step / STEPS));
    }
    if (tip !== this.tip) {
      this.tip = tip;
      this.tray.setToolTip(tip);
    }
    if (isMac && title !== this.title) {
      this.title = title;
      this.tray.setTitle(title, { fontType: 'monospacedDigit' });
    }
  }

  #menu() {
    const mode = this.snap?.mode;
    const inBreak = mode === 'break';
    const act = (name, payload) => () => this.onAction(name, payload);
    return Menu.buildFromTemplate([
      { label: this.tip.replace(/^Atem · /, '') || 'Atem', enabled: false },
      { type: 'separator' },
      { label: 'Jetzt Pause machen', enabled: !inBreak, click: act('break-now') },
      { label: 'Mikropause jetzt', enabled: !inBreak, click: act('micro-now') },
      mode === 'paused'
        ? { label: 'Erinnerungen fortsetzen', click: act('resume') }
        : {
            label: 'Erinnerungen pausieren',
            submenu: [
              { label: '30 Minuten', click: act('pause', 30) },
              { label: '1 Stunde', click: act('pause', 60) },
              { label: '2 Stunden', click: act('pause', 120) },
              { label: 'Bis morgen früh', click: act('pause', 'tomorrow') },
            ],
          },
      { type: 'separator' },
      { label: 'Einstellungen …', click: act('open-settings') },
      { label: 'Atem beenden', click: act('quit') },
    ]);
  }

  destroy() {
    this.tray.destroy();
  }
}

module.exports = { TrayController };
