import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', script), ...args], {
      stdio: 'inherit',
      cwd: root,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} falhou com código ${code}`));
    });
  });
}

const fresh = process.argv.includes('--fresh');
const args = fresh ? ['--fresh'] : [];

await run('crawl-quintoandar.mjs', args);
await run('crawl-auxiliadora.mjs', args);
await run('crawl-guarida.mjs', args);
