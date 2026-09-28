'use strict';

// Drives the real windows once and captures them – a smoke test for development:
//   ATEM_SELFTEST=<dir> ATEM_PROFILE=selftest npx electron .
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { renderIcon } = require('./tray-icon');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run({ dir, windows, scheduler, tray, runAction, updateSettings }) {
  fs.mkdirSync(dir, { recursive: true });
  const log = (...args) => console.log('[selftest]', ...args);
  const capture = async (win, name) => {
    if (!win || win.isDestroyed()) return log('missing window:', name);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG());
    log('captured', name, JSON.stringify(win.getBounds()));
  };

  try {
    // Tray icons for every state, big enough to look at.
    for (const [state, progress] of [['work', 0.35], ['soon', 0.93], ['break', 1], ['paused', 0], ['idle', 0]]) {
      const png = renderIcon(64, { state, progress, ink: '#FFFFFF', accent: state === 'break' ? '#9BE7C4' : '#FFB27A' });
      fs.writeFileSync(path.join(dir, `tray-${state}.png`), png);
    }
    log('tray bounds', JSON.stringify(tray.tray.getBounds()));

    await sleep(5000);
    await capture(windows.settings, 'e1-settings');

    windows.togglePopover(tray.tray.getBounds());
    await sleep(1800);
    await capture(windows.popover, 'e2-popover');
    windows.hidePopover();
    await sleep(800);
    windows.togglePopover(tray.tray.getBounds()); // second opening must animate in just the same
    await sleep(1800);
    await capture(windows.popover, 'e2-popover-again');
    windows.hidePopover();

    windows.showIsland({ kind: 'warn', breakAt: Date.now() + 45_000, snoozesLeft: 2, snoozeMin: 5 });
    await sleep(2500);
    await capture(windows.island, 'e3-island');
    windows.closeIsland();

    runAction('preview-break', 14);
    await sleep(5500);
    for (const [i, win] of windows.breakWins.entries()) await capture(win, `e4-break-${i}`);
    runAction('skip');
    await sleep(1500);
    log('break windows left:', windows.breakWins.length);

    // A real (short) micro break through the scheduler, shown as a capsule.
    scheduler.startBreak('micro', { manual: true });
    await sleep(2500);
    await capture(windows.island, 'e5-micro');
    log('mode during micro:', scheduler.mode);
    scheduler.skipBreak();
    await sleep(1500);
    log('mode after skip:', scheduler.mode, 'island open:', Boolean(windows.island));
    log('snapshot', JSON.stringify(scheduler.snapshot()));

    // Language and theme switch through the main process: tray texts, open windows, window chrome.
    log('tooltip before:', tray.tray && tray.tip);
    updateSettings({ language: 'en', theme: 'light' });
    await sleep(600);
    log('tooltip after:', tray.tip);
    windows.togglePopover(tray.tray.getBounds());
    await sleep(1800);
    await capture(windows.popover, 'e6-popover-en-light');
    windows.hidePopover();
    windows.showIsland({ kind: 'paused', until: Date.now() + 3_600_000 });
    await sleep(2200);
    await capture(windows.island, 'e7-island-en-light');
    windows.closeIsland();
    windows.openSettings();
    await sleep(4500);
    await capture(windows.settings, 'e8-settings-en-light');
    updateSettings({ language: 'de', theme: 'dark' });
    await sleep(600);
    log('tooltip reset:', tray.tip);
  } catch (err) {
    log('FAILED', err.stack || err);
  }
  app.quit();
}

module.exports = { run };
