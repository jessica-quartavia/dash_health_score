# Deploy na Vercel — Health Analytics

## Arquitetura

| Camada | Produção |
|--------|----------|
| Frontend | Estático em `dist/` (`public` + `lib` copiados no build) |
| APIs | Serverless Node em `api/[...path].js` → `lib/api/dispatch-http-api.mjs` |
| Python | Apenas local/CI (`research/modeling`) — **não** roda no build Vercel |

## Causa raiz comprovada: `STATIC_BUILD_NO_OUT_DIR`

No builder `@vercel/static-build`, o erro `STATIC_BUILD_NO_OUT_DIR` só ocorre quando, **depois** do comando de build, `existsSync(outputDirectory)` é falso (`validateDistDir` no repositório Vercel).

Logs do deploy (commit `18c7070`) mostram o contrário ao fim do **mesmo** `npm run build`:

- `cwd` = `projectRoot` = `/vercel/path0`
- `outProject` = `/vercel/path0/dist`
- script termina com **exit 0** e valida `index.html`

Ou seja: **`dist/` é diretório real com conteúdo válido quando o Node encerra**, mas o passo seguinte do builder ainda falha ao resolver `outputDirectory: dist`. Isso não é falta de build local — é **incompatibilidade entre o artefato gerado e o caminho que o static-build valida** (projeto com `public/` + `api/` + `framework: null`).

**Correção no repositório:** além de `dist/`, o build emite **Build Output API v3** (`.vercel/output/config.json` + `.vercel/output/static/`). O static-build detecta v3 **antes** de `validateDistDir` e publica a partir de `.vercel/output` (comportamento documentado da plataforma).

**Painel Vercel:**

1. Root Directory = pasta com `package.json` e `vercel.json`.
2. Build Command vazio ou `npm run build` — **sem** override conflitante.
3. Output Directory vazio ou `dist` — **não** `public`.
4. Framework Preset: **Other**.

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
