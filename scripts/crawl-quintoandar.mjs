import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectQuintoAndar } from './lib/quintoandar.mjs';
import { runCrawl } from './lib/crawl-runner.mjs';
import { normalizeQuintoAndarHouse } from './lib/schema.mjs';
import { parseCliFlags, readConfig, formatConfigSummary } from './lib/crawler-io.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const config = await readConfig(path.join(root, 'config', 'filters.json'));
const { fresh } = parseCliFlags();

const qa = config.sources?.quintoandar || {};
const qaExtra = [
  qa.houseTypes?.length ? `tipos=${qa.houseTypes.join(',')}` : null,
  qa.minBedrooms ? `≥${qa.minBedrooms}q` : null,
  qa.minArea ? `≥${qa.minArea}m²` : null,
].filter(Boolean).join(' · ');
console.log(`Coletando QuintoAndar — ${formatConfigSummary(config)}${qaExtra ? ` · ${qaExtra}` : ''}${fresh ? ' (fresh)' : ''}`);

const { report, ndjsonPath } = await runCrawl({
  root,
  source: 'quintoandar',
  config,
  fresh,
  async collect(ctx) {
    return collectQuintoAndar({
      ...ctx,
      onListing: async (raw) => ctx.onListing(normalizeQuintoAndarHouse(raw)),
      onProgress: async (progress) => {
        process.stdout.write(`\rPágina ${progress.page ?? 0} — reportado: ${progress.reportedTotal ?? '?'} — coletados: ${progress.collected ?? 0}`);
        await ctx.onProgress?.(progress);
      },
    });
  },
});

console.log('\nColeta concluída');
console.log(`NDJSON: ${ndjsonPath}`);
console.log(`Imóveis: ${report.collected}`);
console.log(`Descartados: cidade=${report.discarded.city}, faixa=${report.discarded.cost}, duplicados=${report.discarded.duplicate}`);
