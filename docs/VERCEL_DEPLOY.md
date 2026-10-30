# Deploy na Vercel — Health Analytics

## Modo único: deploy tradicional (zero-config + outputDirectory)

| Camada | Como publica |
|--------|----------------|
| Frontend | `npm run build` → **`dist/`** (`vercel.json` → `"outputDirectory": "dist"`) |
| API | **`api/[...path].js`** + `functions.includeFiles` (string glob) |
| BOA v3 | **Não usar** — não gerar `.vercel/output` no build |

### Por que aparecia `STATIC_BUILD_NO_OUT_DIR` pedindo `public`?

Com **`outputDirectory` ausente** no `vercel.json`, preset **Other** + pasta **`public/`** no repo fazem o static-build validar saída em **`public`**, enquanto o script grava em **`dist`**.

Gerar `.vercel/output` ao mesmo tempo **não substitui** essa validação se o builder não entrar 100% no fluxo prebuilt — daí mistura de modos.

**Correção:** uma abordagem só — `outputDirectory: "dist"` explícito e **sem** `.vercel/output` no build.

## Painel Vercel (conferir manualmente)

| Campo | Valor correto | Valor que quebra |
|-------|---------------|------------------|
| Framework | **Other** | — |
| Root Directory | pasta do `package.json` | pasta pai do monorepo |
| Build Command | vazio ou `npm run build` | — |
| **Output Directory** | **vazio** (herda `dist`) ou **`dist`** | **`public`** ← causa o erro atual |
| Node.js | 20.x | — |

## Variáveis (Production)

- `DATA_SUPABASE_URL`
- `DATA_SUPABASE_SERVICE_ROLE_KEY`
- (Opcional) `BUSINESS_SUPABASE_URL`, `BUSINESS_SUPABASE_SERVICE_ROLE_KEY`

## Pós-deploy

```text
GET /api/health
GET /api/predictive-lab-reference
GET /api/health-score?cluster=ativos
```

JSON (`application/json`), nunca HTML do SPA.

## Alternativa BOA (só se tradicional falhar de forma comprovada)

Usar **somente** `.vercel/output` + `vercel deploy --prebuilt`, **sem** `outputDirectory` no `vercel.json` nem no painel. Não misturar com este modo tradicional.
