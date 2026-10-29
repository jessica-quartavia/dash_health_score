# Dashboard Health Score — Clientes

Dashboard **standalone** e experimental para comparar duas metodologias de Health Score de clientes.

Não faz parte do `dash-simplificado`: tem frontend e backend próprios, em diretório separado.

## Pré-requisitos

- Node.js 18+ (ou Bun compatível com `node`)
- Variáveis `DATA_SUPABASE_URL` e `DATA_SUPABASE_SERVICE_ROLE_KEY` (mesmo `.env` da Jornada / BASE QV)

## Setup

```bash
cp .env.example .env
# preencha DATA_SUPABASE_* com os valores locais da Jornada
# o arquivo precisa se chamar .env, na mesma pasta do package.json

npm start
# ou: node scripts/dev-server.mjs
```

O servidor carrega `.env` e `.env.local` com `process.loadEnvFile` antes de consultar a BASE QV. Variáveis já definidas no ambiente não são substituídas. A inicialização informa se cada variável está presente ou ausente, sem imprimir os valores.

```bash
npm run export:predictive
```

Abra `http://localhost:3010`.

## Endpoints

- `GET /api/health-score` — payload completo (summary, distributions, clients, filters)
- `GET /api/health-score/clientes` — apenas a lista de clientes do recorte

### Query params

| Param | Default | Descrição |
|---|---|---|
| `model` | `completo` | `completo` ou `simplificado` |
| `status` | `active` | Filtro de status analítico |
| `ep` | `all` | Engenheiro patrimonial |
| `program` | `all` | Pharus / Davos |
| `search` | | Nome, código ou ID |
| `finalClass` | `all` | Classificação final do score |
| `situation` | | Ex.: `s1:Saudável`, `s2:Atenção` |
| `engagementWeight` | `50` | Peso de Engajamento no Health Score, em % |
| `mechanismWeight` | `50` | Peso de Mecanismos no Health Score, em % |

## Modelos

**Padrão:** Engajamento (E) × 50% + Mecanismos (M) × 50%

Os pesos podem ser alterados no dashboard. Eles devem somar 100% e são enviados na query string para recalcular KPIs, tabela e CSV.

## Testes

```bash
npm test
```

## Aviso

Este dashboard é experimental para teste de métricas — **não** é score oficial definitivo de churn.
