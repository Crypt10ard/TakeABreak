// Renders pages offscreen (real GPU, no visible window) and saves PNG screenshots.
// Usage: npx electron scripts/capture.cjs <out-dir> <shots.json>
// shots.json: [{ "name": "hero", "page": "settings", "query": "platform=win32", "width": 1280, "height": 840,
//               "wait": 2500, "js": "window.__atem.goto('rhythm')", "after": 1500 }]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Keep caches out of the user's AppData.
app.setPath('userData', path.join(os.tmpdir(), 'atem-capture'));

const [outDir, shotsFile] = process.argv.slice(-2);
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
const root = path.join(__dirname, '..', 'dist', 'renderer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => {}); // keep going between shots
app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    const win = new BrowserWindow({
      width: shot.width || 1280,
      height: shot.height || 840,
      show: false,
      frame: false,
      transparent: !!shot.transparent,
      backgroundColor: shot.transparent ? '#00000000' : '#07080a',
      webPreferences: { offscreen: true, contextIsolation: true, sandbox: true },
    });
    win.webContents.setFrameRate(60);
    let frame = null;
    win.webContents.on('paint', (_e, _dirty, image) => (frame = image));
    win.webContents.on('console-message', (e, legacyLevel, legacyMessage) => {
      const level = e.level ?? legacyLevel;
      const message = e.message ?? legacyMessage;
      if (level === 'error' || level === 'warning' || level >= 2) console.log(`[${shot.name}] console(${level}):`, message);
    });
    const file = path.join(root, shot.page, 'index.html');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await win.loadFile(file, { search: shot.query || '' });
        break;
      } catch (err) {
        console.log(`[${shot.name}] load attempt ${attempt} failed: ${err.message}`);
        await sleep(400);
      }
    }
    await sleep(shot.wait ?? 2500);
    if (shot.js) {
      try {
        await win.webContents.executeJavaScript(shot.js);
      } catch (err) {
        console.log(`[${shot.name}] js error`, err.message);
      }
      await sleep(shot.after ?? 1500);
    }
    if (shot.eval) {
      try {
        const res = await win.webContents.executeJavaScript(shot.eval);
        console.log(`[${shot.name}] eval:`, JSON.stringify(res));
      } catch (err) {
        console.log(`[${shot.name}] eval error`, err.message);
      }
    }
    win.webContents.invalidate();
    await sleep(120);
    if (frame) {
      fs.writeFileSync(path.join(outDir, `${shot.name}.png`), frame.toPNG());
      console.log('saved', shot.name, frame.getSize());
    } else {
      console.log('no frame for', shot.name);
    }
    win.destroy();
    await sleep(300);
  }
  app.quit();
});
