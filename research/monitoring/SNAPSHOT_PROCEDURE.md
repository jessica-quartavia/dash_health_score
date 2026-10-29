# Procedimento de snapshots — monitoramento HS (Etapa 9)

## Objetivo
Registrar séries temporais **pseudonimizadas** do Health Score operacional e camada interpretativa 2.0A, **sem PII** e **sem alterar a BASE QV**.

## Onde ficam os artefatos
- Snapshots: `research/monitoring/snapshots/YYYY-MM-DD_ativos_<fingerprint>.json`
- Manifesto: `research/monitoring/manifest.json`
- Segredo local (HMAC): `research/monitoring/.pseudonym-secret` — **não commitar**
- Relatórios: `research/monitoring/output/` (gerados por `npm run report:etapa9`)

## Atualização
1. Garantir `.env` com credenciais read-only da BASE QV.
2. Executar: `npm run report:etapa9`
3. O pipeline é **idempotente** para o mesmo dia + população + fingerprint de filtros (não duplica arquivo).
4. Em produção (Vercel), **não** confiar no filesystem — rodar snapshots apenas em ambiente local ou storage de pesquisa aprovado.

## Conteúdo de cada snapshot (`hs-monitor-v1`)
- `referenceDay`, `population`, `formulaVersion`, `hs2aVersion`, `filters`
- Por cliente: `clientRef` (`m_*`), HS, E, M, classificação, perfil, qualidade, programa, status observado, coberturas

## Integridade
- Versões de fórmula e 2.0A registradas em cada snapshot.
- Comparações temporais (`snapshot-diff`) **só** entre snapshots com mesma versão.
- Manifesto limitado às ~120 entradas mais recentes.

## Retenção
- Manter snapshots locais conforme política interna; manifesto documenta histórico recente.
- Excluir artefatos ao descomissionar estudo, preservando apenas agregados autorizados.

## Pseudonimização
- `clientRef = m_<HMAC>` — estável por instalação (segredo local).
- Não gravar nome, e-mail ou código legível nos JSON de snapshot.

## Comparação e evolução
- Com dois ou mais snapshots compatíveis, `temporal_comparison_report.json` resume mudanças de faixa, E, M, perfil, qualidade e fluxo da carteira.
- Interpretar mudanças com cautela: pipeline/cadastro podem explicar parte das diferenças.
