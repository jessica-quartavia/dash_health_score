# Deploy na Vercel — Health Analytics

## Arquitetura

| Camada | Produção |
|--------|----------|
| Frontend | Estático em `dist/` (`public` + `lib` copiados no build) |
| APIs | Serverless Node em `api/[...path].js` → mesmo roteador do dev-server |
| Python | Apenas local/CI (`research/modeling`) — **não** roda no build Vercel |

## Painel Vercel (Project Settings)

- **Framework Preset:** Other
- **Root Directory:** raiz do repositório (onde está `package.json` e `vercel.json`)
- **Build Command:** `npm run build` (definido em `vercel.json`)
- **Output Directory:** `dist`
- **Install Command:** `npm install`

## Variáveis de ambiente (Production)

Somente no backend (nunca prefixo `NEXT_PUBLIC_` / expor no browser):

- `DATA_SUPABASE_URL` — BASE QV (somente leitura)
- `DATA_SUPABASE_SERVICE_ROLE_KEY` — segredo servidor
- Business Data (monitoramento), se usado: variáveis documentadas em `docs/MONITORING_ETAPA12.md`

Não commitar `.env`. Não usar `service_role` no cliente.

## SPA

Rotas do dashboard caem em `index.html` exceto `/api/*` e arquivos estáticos em `dist/`.

## Laboratório Preditivo

`/api/predictive-lab-reference` e artefatos JSON versionados em `research/modeling/output/` devem estar no deploy (git) — treinamento Python não é necessário no build.
