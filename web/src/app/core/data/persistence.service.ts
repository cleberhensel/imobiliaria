import { Injectable } from '@angular/core';
import { Priorities, SortKey } from '../models/db.models';

const STORAGE_KEY = 'imoveis-app-state';
const BAIRROS_KEY = 'imoveis-explorer:bairros';

@Injectable({ providedIn: 'root' })
export class PersistenceService {
  loadState(): Partial<{
    preset: 'focus' | 'relaxed' | 'custom';
    priorities: Priorities;
    sortKey: SortKey;
    viewMode: 'cards' | 'compact';
    pinned: string[];
  }> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveState(state: {
    preset: string;
    priorities: Priorities;
    sortKey: SortKey;
    viewMode: 'cards' | 'compact';
    pinned: string[];
  }): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  loadNeighbourhoodNames(): string[] {
    try {
      const raw = sessionStorage.getItem(BAIRROS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveNeighbourhoodNames(names: string[]): void {
    sessionStorage.setItem(BAIRROS_KEY, JSON.stringify(names));
  }
}
