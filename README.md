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

npm start
# ou: node scripts/dev-server.mjs
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

## Modelos

**Completo:** S1×10% + S2×30% + S3×10% + S4×50%  
**Simplificado:** S2×40% + S4×60%  

Score final limitado a `min(ponderado, 100)`.

## Testes

```bash
npm test
```

## Aviso

Este dashboard é experimental para teste de métricas — **não** é score oficial definitivo de churn.
