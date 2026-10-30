# Deploy na Vercel — Health Analytics

## Arquitetura em produção

| Camada | Produção |
|--------|----------|
| Frontend | Estático em `dist/` (`npm run build` copia `public/` + `lib/` do browser) |
| APIs | **Serverless** `api/[...path].js` → `lib/api/dispatch-http-api.mjs` (mesmo roteador do `dev-server.mjs`) |
| Local | `npm run dev` → `scripts/dev-server.mjs` na porta 3010 (Node persistente) |

**Não** emitir `.vercel/output/config.json` (Build Output API v3) no build: isso publica **apenas** estáticos e **remove** as funções `/api/*` (sintoma: UI ok, KPIs vazios, `/api/health` → 404).

## Variáveis de ambiente (Production)

Cadastrar em **Vercel → Settings → Environment Variables** (somente backend; nunca `NEXT_PUBLIC_*`):

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `DATA_SUPABASE_URL` | Sim | BASE QV (leitura) |
| `DATA_SUPABASE_SERVICE_ROLE_KEY` | Sim | Credencial servidor BASE QV |
| `BUSINESS_SUPABASE_URL` | Monitoramento | Business Data (snapshots) |
| `BUSINESS_SUPABASE_SERVICE_ROLE_KEY` | Monitoramento | Service role Business Data |
| `AUTH_SUPABASE_URL` | Fallback BD | Alternativa de URL Business Data |
| `AUTH_SUPABASE_SERVICE_ROLE_KEY` | Fallback BD | Alternativa de chave Business Data |

Aliases aceitos no código: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (preferir os nomes `DATA_*`).

Artefatos preditivos vêm do **git** (`research/modeling/output/*.json`), não de variáveis.

## Painel Vercel

| Campo | Valor |
|-------|--------|
| Framework Preset | **Other** |
| Root Directory | pasta com `package.json` + `vercel.json` |
| Build Command | vazio ou `npm run build` |
| Output Directory | vazio ou `dist` (**não** `public`) |
| Node.js | **20.x** |

## Rotas

- SPA: rewrite para `/index.html` exceto `/api/*` (`vercel.json`).
- APIs: catch-all `api/[...path].js` — deve aparecer no deployment como Serverless Function.

## Requisições na inicialização do dashboard

| Ordem | Endpoint | Uso |
|-------|----------|-----|
| 1 | `GET /api/config-status` | Probe de API + env (boot) |
| 2 | `GET /api/health-score?…` | Payload principal (KPIs, filtros, clientes) |
| 3 | `GET /api/system-status` | Faixas de status no topo |
| 4 | `GET /api/research-bundle` | Laboratório / metadados |
| 5 | `GET /api/monitoring-history` | Após payload (monitoramento) |

Demais rotas sob demanda: `research-panorama`, `predictive-lab-reference`, `monitoring-summary`, `portfolio-evolution-summary`, `client-snapshot-history`, `client-hs-history`, CSVs, etc. — todas via `api/[...path].js` → `dispatchHttpApi`.

## Verificação pós-deploy

```text
GET /api/health              → 200 JSON
GET /api/config-status       → 200/503 JSON (nunca HTML)
GET /api/health-score?...    → 200 JSON com clients[]
GET /api/predictive-lab-reference → 200 JSON
```

## Build local

```bash
npm run build
npm test
```
