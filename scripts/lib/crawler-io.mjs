import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

export function normalizeCity(city) {
  return String(city || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isPortoAlegre(city) {
  return normalizeCity(city) === 'porto alegre';
}

export function inCostRange(totalCost, minTotalCost, maxTotalCost) {
  const value = Number(totalCost) || 0;
  return value >= minTotalCost && value <= maxTotalCost;
}

export function passesListingFilters(listing, config) {
  if (!isPortoAlegre(listing.city)) {
    return { ok: false, reason: 'city' };
  }
  if (!inCostRange(listing.totalCost, config.minTotalCost, config.maxTotalCost)) {
    return { ok: false, reason: 'cost' };
  }
  return { ok: true, reason: null };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitteredDelay(baseMs = 300, spreadMs = 350) {
  return sleep(baseMs + Math.floor(Math.random() * spreadMs));
}

/**
 * @param {() => Promise<unknown>} fn
 * @param {object} [options]
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = 5,
    baseDelayMs = 500,
    shouldRetry = (error) => true,
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) throw error;
      await sleep(baseDelayMs * attempt + Math.floor(Math.random() * 200));
    }
  }

  throw lastError;
}

export function getRawPaths(root, source) {
  const rawDir = path.join(root, 'data', 'raw');
  return {
    rawDir,
    ndjsonPath: path.join(rawDir, `${source}.ndjson`),
    stateDir: path.join(rawDir, '.state'),
    statePath: path.join(rawDir, '.state', `${source}.json`),
    reportPath: path.join(rawDir, `report-${source}.json`),
  };
}

export async function ensureRawDirs(root, source) {
  const paths = getRawPaths(root, source);
  await fs.mkdir(paths.rawDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  return paths;
}

export async function loadCheckpoint(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCheckpoint(statePath, checkpoint) {
  await fs.writeFile(statePath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
}

export async function resetRawOutput(ndjsonPath, statePath) {
  await fs.rm(ndjsonPath, { force: true });
  await fs.rm(statePath, { force: true });
}

export function createNdjsonWriter(ndjsonPath, { append = false } = {}) {
  const stream = createWriteStream(ndjsonPath, { flags: append ? 'a' : 'w' });
  let count = 0;

  return {
    async write(listing) {
      stream.write(`${JSON.stringify(listing)}\n`);
      count += 1;
    },
    async close() {
      await new Promise((resolve, reject) => {
        stream.end((error) => (error ? reject(error) : resolve()));
      });
      return count;
    },
    get count() {
      return count;
    },
  };
}

export async function countNdjsonLines(ndjsonPath) {
  try {
    const content = await fs.readFile(ndjsonPath, 'utf8');
    if (!content.trim()) return 0;
    return content.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

export async function loadSeenIds(ndjsonPath) {
  const seen = new Set();
  try {
    const content = await fs.readFile(ndjsonPath, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const listing = JSON.parse(line);
      if (listing?.sourceId) seen.add(String(listing.sourceId));
      if (listing?.id) seen.add(String(listing.id));
    }
  } catch {
    // fresh file
  }
  return seen;
}

export async function writeReport(reportPath, report) {
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function readConfig(configPath) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  config.minTotalCost = Number(config.minTotalCost ?? 0);
  config.maxTotalCost = Number(config.maxTotalCost ?? 4500);
  config.defaults = config.defaults || {};
  config.defaults.maxListingsPerSource = config.defaults.maxListingsPerSource ?? null;
  config.sources = config.sources || {};

  for (const [sourceId, sourceConfig] of Object.entries(config.sources)) {
    config.sources[sourceId] = normalizeSourceConfig(sourceConfig, config.defaults);
  }

  return config;
}

/**
 * @param {Record<string, unknown>} sourceConfig
 * @param {Record<string, unknown>} defaults
 */
export function normalizeSourceConfig(sourceConfig = {}, defaults = {}) {
  const maxListings = sourceConfig.maxListings ?? defaults.maxListingsPerSource ?? null;
  return {
    ...sourceConfig,
    maxListings: maxListings == null ? null : Number(maxListings),
  };
}

/**
 * @param {object} config
 * @param {string} sourceId
 */
export function getSourceConfig(config, sourceId) {
  return config.sources?.[sourceId] || normalizeSourceConfig({}, config.defaults);
}

export function formatConfigSummary(config) {
  const defaultCap = config.defaults?.maxListingsPerSource;
  const capLabel = defaultCap ? `${defaultCap}/fonte` : 'sem limite';
  return `${config.city}/${config.state} · R$ ${config.minTotalCost}–${config.maxTotalCost} · máx. ${capLabel}`;
}

export function parseCliFlags(argv = process.argv.slice(2)) {
  return {
    fresh: argv.includes('--fresh'),
    dryRun: argv.includes('--dry-run'),
  };
}
