# Deploy na Vercel — Health Analytics

## Arquitetura

| Camada | Produção |
|--------|----------|
| Frontend | Estático em `dist/` (`public` + `lib` copiados no build) |
| APIs | Serverless Node em `api/[...path].js` → `lib/api/dispatch-http-api.mjs` |
| Python | Apenas local/CI (`research/modeling`) — **não** roda no build Vercel |

## Causa raiz comum: `STATIC_BUILD_NO_OUT_DIR`

O script `scripts/vercel-build.mjs` grava `dist/` **sempre** ao lado de `package.json` (caminho absoluto a partir do script). A Vercel, após o build, procura `dist/` relativo ao **Root Directory** do projeto (`process.cwd()` no job).

Se o repositório no GitHub for um monorepo (`dash_health_score/dash-health-score/`) e o painel tiver **Root Directory** na pasta pai, ou o **Build Command** invocar `node dash-health-score/scripts/vercel-build.mjs` sem `cd` na subpasta, o log pode mostrar build OK enquanto `dist/` só existe dentro da subpasta — daí `[STATIC_BUILD_NO_OUT_DIR]`.

**Correção no repositório:** o build espelha `dist/` para `process.cwd()/dist` quando difere da raiz do app.

**Correção no painel (escolha uma):**

1. **Recomendado:** Root Directory = pasta que contém `package.json` e `vercel.json` (raiz do app, ex.: `dash-health-score` se o clone tiver essa subpasta).
2. Build Command = `npm run build` (não chamar o `.mjs` com caminho relativo a partir da pasta pai sem espelhamento).
3. Desligar overrides conflitantes: Output Directory deve ser `dist`, não `public` (preset “Other” usa `public/` por padrão se existir).

## Painel Vercel (Project Settings)

| Campo | Valor |
|-------|--------|
| Framework Preset | **Other** |
| Root Directory | Pasta com `package.json` + `vercel.json` |
| Build Command | *(vazio — usar `vercel.json`)* ou `npm run build` |
| Output Directory | *(vazio — usar `vercel.json`)* ou `dist` |
| Install Command | `npm install` |
| Node.js Version | **20.x** (ver `engines` no `package.json`) |

Evite marcar **Override** com `public` como output: o app publica em `dist/`, não em `public/` (fonte estática).

## Variáveis de ambiente (Production)

Somente no backend (nunca prefixo `NEXT_PUBLIC_`):

- `DATA_SUPABASE_URL`
- `DATA_SUPABASE_SERVICE_ROLE_KEY`
- Business Data (monitoramento), se usado: ver `docs/MONITORING_ETAPA12.md`

## SPA

`vercel.json` reescreve rotas do dashboard para `/index.html`, exceto `/api/*`. Arquivos estáticos (`*.js`, `*.css`, …) continuam servidos de `dist/`.

## Laboratório Preditivo e `/api/*`

Produção **não** usa `scripts/dev-server.mjs`. Todas as rotas passam por `api/[...path].js`.

- `GET /api/predictive-lab-reference` — pacote versionado (Etapas 4, 15–17)
- Outros JSON em `research/modeling/output/` — lidos pelo dispatch serverless

Artefatos JSON versionados devem estar **no git** (exceções no `.gitignore`) e entram no bundle via `functions.includeFiles` em `vercel.json`. Sem esses arquivos no deploy, a API responde `partial` / `missing` — sem rerodar Python na Vercel.

## Build local

```bash
npm run build
# dist/index.html + dist/lib/
```

O build falha com exit 1 se `dist/index.html` não existir na raiz do app **e** em `cwd/dist` após espelhamento.
