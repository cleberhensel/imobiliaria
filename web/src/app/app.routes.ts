import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'explorar', pathMatch: 'full' },
  {
    path: 'explorar',
    loadComponent: () => import('./features/explorer/explorer-page.component').then((m) => m.ExplorerPageComponent),
  },
  {
    path: 'tabela',
    loadComponent: () => import('./features/table/table-page.component').then((m) => m.TablePageComponent),
  },
  { path: '**', redirectTo: 'explorar' },
];
