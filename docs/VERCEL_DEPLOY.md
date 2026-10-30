# Deploy na Vercel — Health Analytics

## Modo de publicação (Build Output API v3)

O build (`npm run build`) gera:

| Artefato | Função |
|----------|--------|
| `dist/` | Cópia local / testes (não é `outputDirectory` no painel) |
| `.vercel/output/static/` | Frontend (HTML, JS, CSS, `lib` do browser) |
| `.vercel/output/functions/api/[...path].func/` | Serverless — mesmo `dispatchHttpApi` do dev-server |
| `.vercel/output/config.json` | `{ "version": 3, "routes": [...] }` — SPA + filesystem |

**`vercel.json` não define `outputDirectory` nem `functions`.** Isso evita:

- `STATIC_BUILD_NO_OUT_DIR` (validação de `dist/` no static-build apesar de `dist` existir).
- Deploy estático-only (BOA v3 só com `static/` sem `functions/`).

## Painel Vercel

| Campo | Valor |
|-------|--------|
| Framework Preset | **Other** |
| Root Directory | pasta com `package.json` |
| Build Command | vazio ou `npm run build` |
| **Output Directory** | **vazio** (não usar `dist`) |
| Node.js | 20.x |

## Variáveis (Production)

- `DATA_SUPABASE_URL`
- `DATA_SUPABASE_SERVICE_ROLE_KEY`
- (Opcional) `BUSINESS_SUPABASE_URL`, `BUSINESS_SUPABASE_SERVICE_ROLE_KEY`

## Verificação pós-deploy

```text
GET /api/health
GET /api/config-status
GET /api/health-score?cluster=ativos
GET /api/predictive-lab-reference
```

Todos devem retornar JSON (nunca HTML do SPA).
