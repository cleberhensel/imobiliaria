import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAuxiliadoraPredial } from './lib/auxiliadora-predial.mjs';
import { runCrawl } from './lib/crawl-runner.mjs';
import { normalizeAuxiliadoraListing } from './lib/schema.mjs';
import { parseCliFlags, readConfig, formatConfigSummary } from './lib/crawler-io.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const config = await readConfig(path.join(root, 'config', 'filters.json'));
const { fresh } = parseCliFlags();

console.log(`Coletando Auxiliadora Predial — ${formatConfigSummary(config)}${fresh ? ' (fresh)' : ''}`);

const { report, ndjsonPath } = await runCrawl({
  root,
  source: 'auxiliadora-predial',
  config,
  fresh,
  async collect(ctx) {
    return collectAuxiliadoraPredial({
      ...ctx,
      onListing: async (raw) => ctx.onListing(normalizeAuxiliadoraListing(raw)),
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
