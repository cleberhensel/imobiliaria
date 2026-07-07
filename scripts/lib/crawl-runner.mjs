import {
  createNdjsonWriter,
  ensureRawDirs,
  loadCheckpoint,
  loadSeenIds,
  passesListingFilters,
  resetRawOutput,
  saveCheckpoint,
  writeReport,
} from './crawler-io.mjs';

/**
 * @param {object} params
 * @param {string} params.root
 * @param {string} params.source
 * @param {object} params.config
 * @param {boolean} [params.fresh]
 * @param {(ctx: object) => Promise<object>} params.collect
 */
export async function runCrawl({
  root,
  source,
  config,
  fresh = false,
  collect,
}) {
  const paths = await ensureRawDirs(root, source);
  const { ndjsonPath, statePath, reportPath } = paths;

  if (fresh) {
    await resetRawOutput(ndjsonPath, statePath);
  }

  const checkpoint = fresh ? null : await loadCheckpoint(statePath);
  const seenIds = fresh ? new Set() : await loadSeenIds(ndjsonPath);
  const writer = createNdjsonWriter(ndjsonPath, { append: Boolean(checkpoint) });

  const report = {
    source,
    city: config.city,
    state: config.state,
    filter: {
      minTotalCost: config.minTotalCost,
      maxTotalCost: config.maxTotalCost,
    },
    startedAt: new Date().toISOString(),
    resumed: Boolean(checkpoint),
    reportedTotal: checkpoint?.reportedTotal ?? null,
    pagesFetched: checkpoint?.pagesFetched ?? 0,
    collected: seenIds.size,
    discarded: {
      city: checkpoint?.discarded?.city ?? 0,
      cost: checkpoint?.discarded?.cost ?? 0,
      duplicate: checkpoint?.discarded?.duplicate ?? 0,
    },
    errors: checkpoint?.errors ?? [],
  };

  const persistCheckpoint = async (nextCheckpoint) => {
    await saveCheckpoint(statePath, {
      ...nextCheckpoint,
      discarded: report.discarded,
      errors: report.errors,
      collected: report.collected,
    });
  };

  const onListing = async (listing) => {
    const filterResult = passesListingFilters(listing, config);
    if (!filterResult.ok) {
      report.discarded[filterResult.reason] += 1;
      return false;
    }

    const sourceId = String(listing.sourceId || listing.id);
    if (seenIds.has(sourceId)) {
      report.discarded.duplicate += 1;
      return false;
    }

    seenIds.add(sourceId);
    await writer.write(listing);
    report.collected += 1;
    return true;
  };

  try {
    const result = await collect({
      config,
      checkpoint,
      seenIds,
      onListing,
      onProgress: async (progress) => {
        report.pagesFetched = progress.page ?? report.pagesFetched;
        report.reportedTotal = progress.reportedTotal ?? report.reportedTotal;
        if (progress.checkpoint) {
          await persistCheckpoint(progress.checkpoint);
        }
      },
    });

    report.pagesFetched = result.pagesFetched ?? report.pagesFetched;
    report.reportedTotal = result.reportedTotal ?? report.reportedTotal;
    report.finishedAt = new Date().toISOString();
    report.completed = true;

    await writer.close();
    await writeReport(reportPath, report);

    return { report, ndjsonPath, reportPath };
  } catch (error) {
    report.errors.push(String(error?.message || error));
    report.finishedAt = new Date().toISOString();
    report.completed = false;
    await writer.close();
    await writeReport(reportPath, report);
    throw error;
  }
}
