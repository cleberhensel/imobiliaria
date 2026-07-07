import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', script)], {
      stdio: 'inherit',
      cwd: root,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} falhou com código ${code}`));
    });
  });
}

await run('fetch-quintoandar.mjs');
await run('fetch-auxiliadora-predial.mjs');
await run('fetch-guarida.mjs');
await run('merge-catalogs.mjs');
