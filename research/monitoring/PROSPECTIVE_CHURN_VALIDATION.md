# Protocolo de validação prospectiva — churn 90d

Versão: etapa9-v1 · **Não treina modelos nesta etapa**

## População
- Inicial: clientes **ativos** no snapshot (pseudonimizado `m_*`).
- Exclusões: documentar no manifest (cancelados, censura).

## Referência e rótulo
- **Data de referência:** dia do snapshot (`referenceDay`).
- **Horizonte:** 90 dias civis após fim do mês de referência (política alinhada à pesquisa).
- **Maturação do rótulo:** ref + 90d <= data de extração consolidada de churn.
- **Censura:** clientes sem janela fechada excluídos do rótulo, não imputados.

## Eventos de churn
- Mesma precedência da consolidação Etapa 3 (efetivação, não pedido isolado).

## Features congeladas
- Features calculadas somente com dados <= referência; versão registrada no snapshot.

## Modelo
- Versionamento: `modeling_results_etapa4.json` + hash de config; **novo treino fora desta etapa**.

## Avaliação futura
- Períodos já usados para exploração (ex.: jun/2026) **não** são teste confirmatório independente.
- Exigir mês com rótulo maduro **não utilizado** para seleção/ajuste.

## Procedimento
1. Congelar snapshot + versões.
2. Aguardar maturação 90d.
3. Consolidar churn (read-only).
4. Avaliar métricas sem reajuste no teste.
5. Calibrar apenas em val separada.


Retenção: até 120 snapshots no manifest (rotação local).
Integridade: manifest.json lista arquivos; não editar JSON manualmente.
Atualização: npm run monitoring:snapshot após carga BASE QV (somente leitura).
Ambiente: armazenamento local/gitignore — não usar filesystem efêmero de deploy serverless como fonte única.
PII: proibido — apenas clientRef estável m_*

