import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNdjsonWriter, ensureRawDirs, readConfig, passesListingFilters } from './lib/crawler-io.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const config = await readConfig(path.join(root, 'config', 'filters.json'));

const legacySources = [
  { file: 'quintoandar.json', source: 'quintoandar' },
  { file: 'auxiliadora-predial.json', source: 'auxiliadora-predial' },
  { file: 'guarida.json', source: 'guarida' },
];

for (const entry of legacySources) {
  const inputPath = path.join(root, 'data', entry.file);
  try {
    await fs.access(inputPath);
  } catch {
    continue;
  }

  const catalog = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const listings = catalog.listings || [];
  if (!listings.length) continue;

  const bySource = { [entry.source]: listings };

  for (const [source, items] of Object.entries(bySource)) {
    const { ndjsonPath } = await ensureRawDirs(root, source);
    const writer = createNdjsonWriter(ndjsonPath, { append: false });
    let kept = 0;

    for (const listing of items) {
      const result = passesListingFilters(listing, config);
      if (!result.ok) continue;
      await writer.write(listing);
      kept += 1;
    }

    await writer.close();
    console.log(`${source}: ${kept} listings → ${ndjsonPath}`);
  }
}

console.log('Migração legacy → NDJSON concluída');
