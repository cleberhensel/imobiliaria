# Imóveis — Luz & Centro

SPA Angular (GitHub Pages) para explorar aluguéis em Porto Alegre com database estático JSON.

## Configuração (`config/filters.json`)

Todos os limites e filtros ficam num único arquivo:

```json
{
  "city": "Porto Alegre",
  "state": "RS",
  "minTotalCost": 1500,
  "maxTotalCost": 5000,
  "defaults": {
    "maxListingsPerSource": 1000
  },
  "sources": {
    "quintoandar": {},
    "auxiliadora-predial": {},
    "guarida": { "maxListings": 500 }
  }
}
```

- `defaults.maxListingsPerSource` — limite global por imobiliária (atual: **1000**)
- `sources.{fonte}.maxListings` — override individual por fonte
- `minTotalCost` / `maxTotalCost` — faixa de custo total mensal

## Fluxo operacional

1. **Coletar dados** (local, faixa R$ 1.500–5.000, somente Porto Alegre):

```bash
npm run crawl:all          # todas as fontes
npm run crawl:quintoandar  # fonte individual
# retomar coleta interrompida (padrão) ou recomeçar:
npm run crawl:all -- --fresh
```

2. **Compilar database** (colunas + shards → `web/public/db/`):

```bash
npm run db:compile
# ou migrar catálogo legacy + compilar:
npm run db:build
```

3. **Revisar reports** em `data/raw/report-*.json` e commitar `data/raw/*.ndjson` + `web/public/db/`.

4. **Desenvolver / buildar frontend**:

```bash
npm run web:start
npm run web:build
```

5. Push na `main` dispara deploy automático no GitHub Pages.

## Estrutura

- `config/filters.json` — **config centralizada**: cidade, faixa de preço, limite por fonte (`defaults.maxListingsPerSource`, override em `sources.{fonte}.maxListings`)
- `scripts/` — crawlers v2 (NDJSON + checkpoint) e compilador
- `data/raw/` — coleta bruta normalizada (NDJSON)
- `web/` — Angular standalone (`/#/explorar`, `/#/tabela`)
- `web/public/db/` — database estático consumido pela SPA

## Rotas

- `/#/explorar` — explorador visual (cards, filtros, comparador)
- `/#/tabela` — KPIs, gráfico por bairro, tabela analítica
