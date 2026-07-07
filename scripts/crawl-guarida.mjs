import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGuarida } from './lib/guarida.mjs';
import { runCrawl } from './lib/crawl-runner.mjs';
import { normalizeGuaridaListing } from './lib/schema.mjs';
import { parseCliFlags, readConfig, formatConfigSummary } from './lib/crawler-io.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const config = await readConfig(path.join(root, 'config', 'filters.json'));
const { fresh } = parseCliFlags();

console.log(`Coletando Guarida — ${formatConfigSummary(config)}${fresh ? ' (fresh)' : ''}`);

const { report, ndjsonPath } = await runCrawl({
  root,
  source: 'guarida',
  config,
  fresh,
  async collect(ctx) {
    return collectGuarida({
      ...ctx,
      onListing: async (raw) => ctx.onListing(normalizeGuaridaListing(raw)),
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
