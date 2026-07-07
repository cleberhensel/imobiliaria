import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  DbColumns,
  DbDicts,
  DbManifest,
  DbSummary,
  DetailListing,
  LiteListing,
} from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class DbClient {
  private readonly http = inject(HttpClient);
  private manifestCache: DbManifest | null = null;

  async loadManifest(force = false): Promise<DbManifest> {
    if (this.manifestCache && !force) return this.manifestCache;
    this.manifestCache = await firstValueFrom(
      this.http.get<DbManifest>('db/manifest.json', {
        headers: { 'Cache-Control': 'no-cache' },
      }),
    );
    return this.manifestCache;
  }

  private versioned(path: string, buildHash: string): string {
    return `${path}?v=${buildHash}`;
  }

  loadSummary(buildHash: string): Promise<DbSummary> {
    return firstValueFrom(this.http.get<DbSummary>(this.versioned('db/summary.json', buildHash)));
  }

  loadDicts(buildHash: string): Promise<DbDicts> {
    return firstValueFrom(this.http.get<DbDicts>(this.versioned('db/dicts.json', buildHash)));
  }

  loadColumns(buildHash: string): Promise<DbColumns> {
    return firstValueFrom(this.http.get<DbColumns>(this.versioned('db/columns.json', buildHash)));
  }

  loadSearch(buildHash: string): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>(this.versioned('db/search.json', buildHash)));
  }

  loadLiteShard(buildHash: string, file: string): Promise<LiteListing[]> {
    return firstValueFrom(this.http.get<LiteListing[]>(this.versioned(`db/${file}`, buildHash)));
  }

  loadDetailShard(buildHash: string, file: string): Promise<DetailListing[]> {
    return firstValueFrom(this.http.get<DetailListing[]>(this.versioned(`db/${file}`, buildHash)));
  }
}
