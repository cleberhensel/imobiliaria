import { Injectable } from '@angular/core';
import { DbDicts, PhotoEncoded } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class ShardLoader {
  private readonly liteCache = new Map<string, Map<number, unknown>>();
  private readonly detailCache = new Map<string, Map<number, unknown>>();
  private readonly inflight = new Map<string, Promise<void>>();

  clear(): void {
    this.liteCache.clear();
    this.detailCache.clear();
    this.inflight.clear();
  }

  decodePhoto(encoded: PhotoEncoded, dicts: DbDicts): string | null {
    if (!encoded) return null;
    const [prefixIdx, suffixIdx] = encoded;
    if (prefixIdx === -1) return dicts.photoFull[suffixIdx] || null;
    return `${dicts.photoPrefixes[prefixIdx]}${dicts.photoSuffixes[suffixIdx]}`;
  }

  async loadLiteOrdinals(
    buildHash: string,
    liteShardSize: number,
    ordinals: number[],
    fetchShard: (file: string) => Promise<unknown[]>,
    liteFiles: string[],
  ): Promise<Map<number, unknown>> {
    const needed = new Map<number, unknown>();
    const shardGroups = new Map<number, number[]>();

    for (const ordinal of ordinals) {
      const shardIndex = Math.floor(ordinal / liteShardSize);
      if (!shardGroups.has(shardIndex)) shardGroups.set(shardIndex, []);
      shardGroups.get(shardIndex)!.push(ordinal);
    }

    await Promise.all([...shardGroups.keys()].map(async (shardIndex) => {
      const file = liteFiles[shardIndex];
      if (!file) return;
      const cacheKey = `${buildHash}:${file}`;
      if (!this.liteCache.has(cacheKey)) {
        if (!this.inflight.has(cacheKey)) {
          this.inflight.set(cacheKey, fetchShard(file).then((items) => {
            const map = new Map<number, unknown>();
            for (const item of items as { o: number }[]) map.set(item.o, item);
            this.liteCache.set(cacheKey, map);
          }).finally(() => this.inflight.delete(cacheKey)));
        }
        await this.inflight.get(cacheKey);
      }
      const map = this.liteCache.get(cacheKey)!;
      for (const ordinal of shardGroups.get(shardIndex)!) {
        if (map.has(ordinal)) needed.set(ordinal, map.get(ordinal));
      }
    }));

    return needed;
  }

  async loadDetailOrdinal(
    buildHash: string,
    detailShardSize: number,
    ordinal: number,
    fetchShard: (file: string) => Promise<unknown[]>,
    detailFiles: string[],
  ): Promise<unknown | null> {
    const shardIndex = Math.floor(ordinal / detailShardSize);
    const file = detailFiles[shardIndex];
    if (!file) return null;
    const cacheKey = `${buildHash}:${file}`;

    if (!this.detailCache.has(cacheKey)) {
      const items = await fetchShard(file);
      const map = new Map<number, unknown>();
      for (const item of items as { o: number }[]) map.set(item.o, item);
      this.detailCache.set(cacheKey, map);
    }

    return this.detailCache.get(cacheKey)!.get(ordinal) ?? null;
  }
}
