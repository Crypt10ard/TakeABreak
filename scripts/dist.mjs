// electron-builder with retries: on Windows a virus scanner sometimes locks the freshly
// unpacked Electron for a moment (EPERM on rename). Waiting and trying again fixes it.
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);

function run() {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn('npx', ['electron-builder', ...args], { cwd: root, shell: true });
    const forward = (stream, target) =>
      stream.on('data', (chunk) => {
        output += chunk;
        target.write(chunk);
      });
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on('close', (code) => resolve({ code, output }));
  });
}

for (let attempt = 1; attempt <= 4; attempt++) {
  const { code, output } = await run();
  if (code === 0) process.exit(0);
  if (!/EPERM|EBUSY/.test(output) || attempt === 4) process.exit(code ?? 1);
  console.log(`\nEine Datei war kurz gesperrt (vermutlich der Virenscanner). Neuer Versuch ${attempt + 1}/4 …\n`);
  await new Promise((r) => setTimeout(r, 4000));
  await rm(path.join(root, 'release'), { recursive: true, force: true }).catch(() => {});
}
