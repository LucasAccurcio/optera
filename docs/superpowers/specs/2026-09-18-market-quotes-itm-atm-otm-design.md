# Cotacoes e Classificacao ITM/ATM/OTM

## Contexto

O MVP possui operacoes e estrategias, mas ainda nao possui uma fonte de
cotacao do ativo objeto. A Fase 1 adicionara cotacoes sob demanda, cache da
ultima cotacao conhecida e indicadores calculados para operacoes abertas.

Operacoes encerradas sao historico imutavel e nao participam do fluxo de
atualizacao ou de qualquer recalculo dependente de mercado.

## Objetivos

- Consultar os ativos objeto das operacoes abertas usando a brapi.
- Manter a integracao externa atras da abstracao `MarketDataProvider`.
- Persistir uma cotacao atual por ativo, preservando o ultimo valor valido.
- Permitir atualizacao global manual e automatica ao abrir a tela de posicoes.
- Calcular distancia ao strike e classificacao ITM, ATM ou OTM.
- Funcionar sem chamar a brapi quando `BRAPI_TOKEN` nao estiver configurado.
- Manter o token exclusivamente no backend.

## Fora de escopo

- Cotacao em tempo real ou streaming.
- Cotacao ou cadeia de opcoes.
- Historico de todas as atualizacoes.
- Alteracao de preco de opcao, resultado realizado ou dados de operacoes
  encerradas.
- Alertas de vencimento e simulacao de resultado no vencimento.

## Arquitetura

O backend tera tres camadas separadas:

1. `MarketDataProvider` define a consulta de ativos sem conhecer HTTP,
   variaveis de ambiente ou a brapi.
2. `BrapiMarketDataProvider` implementa a consulta em lote e transforma a
   resposta externa em `AssetQuote`.
3. `QuoteService` identifica ativos abertos, deduplica, coordena a consulta,
   atualiza o cache e devolve sucessos e avisos.

As funcoes de distancia e classificacao serao puras e independentes do
provedor. O frontend recebera somente dados e status produzidos pelo backend.

## Configuracao e seguranca

`BRAPI_TOKEN` sera opcional no backend e documentado em
`backend/.env.example`. Quando ausente ou vazio:

- o backend continuara inicializando;
- `BrapiMarketDataProvider` nao fara requisicao externa;
- a atualizacao retornara aviso de provedor indisponivel;
- valores existentes no cache serao preservados;
- ativos sem cache serao retornados sem preco.

O token nao sera adicionado ao frontend, ao bundle, a respostas HTTP ou a
logs de erro.

## Persistencia

Adicionar o modelo `AssetQuote` ao Prisma:

```text
id          String   UUID primary key
asset       String   unique
price       Decimal? Decimal(18, 6)
timestamp   DateTime?
source      String
delayed     Boolean  default true
lastError   String?
createdAt   DateTime default now
updatedAt   DateTime updated
```

O cache tera uma linha por ativo. Uma resposta bem-sucedida atualiza `price`,
`timestamp`, `source`, `delayed` e limpa `lastError`. Uma falha atualiza apenas
`lastError`, mantendo o ultimo preco e timestamp validos. Se nao houver cache,
o ativo continuara sem preco.

## Contratos

Contrato do provedor:

```typescript
interface AssetQuote {
  asset: string;
  price: string;
  timestamp: string;
  source: string;
  delayed: boolean;
}

interface MarketDataProvider {
  getQuotes(assets: string[]): Promise<AssetQuote[]>;
}
```

Endpoints do backend:

```text
POST /quotes/refresh
GET  /quotes
```

`POST /quotes/refresh` sempre considera todas as operacoes abertas, remove
duplicidades por ativo normalizado e retorna o estado atual do cache, alem de
avisos por ativo quando houver falha. `GET /quotes` retorna o cache atual sem
acionar consulta externa.

## Fluxo de atualizacao

1. Buscar operacoes com `closedAt = null`.
2. Extrair `asset`, normalizar a identificacao e remover duplicidades.
3. Ler o cache atual para esses ativos.
4. Se nao houver token, nao chamar o provedor e retornar os caches com aviso.
5. Se houver token, consultar os ativos em lote.
6. Persistir apenas respostas validas e positivas.
7. Registrar falhas sem substituir valores validos.
8. Devolver cotacoes, ultima atualizacao e avisos.

Atualizacoes concorrentes serao bloqueadas no processo do backend. Uma segunda
chamada enquanto a primeira estiver em andamento recebera `409
QUOTES_REFRESH_IN_PROGRESS`, sem aguardar e sem iniciar outra consulta externa.

## Regras financeiras

Para cada operacao aberta com cotacao disponivel:

- distancia em reais: `precoDoAtivo - strike`;
- distancia percentual: `abs(precoDoAtivo - strike) / precoDoAtivo * 100`;
- ATM quando a distancia percentual for menor ou igual a `1%`;
- PUT: abaixo do strike e ITM, acima e OTM;
- CALL: acima do strike e ITM, abaixo e OTM.

Quando estiver dentro da margem ATM, ATM prevalece sobre ITM ou OTM. Preco
ausente, nulo ou igual a zero nao produz classificacao nem distancia; a
interface mostra `-`.

Todas as pernas de uma estrategia usam a mesma cotacao do seu ativo objeto.

## Integracao no frontend

Na tela `Positions`:

- adicionar um unico botao global `Atualizar cotacoes`;
- iniciar uma atualizacao ao abrir a tela;
- exibir `Atualizando...` durante a requisicao;
- bloquear novas atualizacoes durante a requisicao;
- mostrar horario da ultima atualizacao;
- mostrar preco, distancia e classificacao em cada operacao aberta;
- mostrar `-` quando nao houver cotacao;
- mostrar avisos de token ausente ou falha parcial sem remover cache valido.

Operacoes encerradas continuam exibindo apenas os dados historicos ja
existentes e nao receberao indicadores recalculados.

## Falhas e recuperacao

- Token ausente: comportamento degradado informativo, sem requisicao externa.
- Falha total da brapi: preservar todo o cache e exibir aviso.
- Falha parcial: atualizar ativos validos e preservar cache dos demais.
- Resposta invalida ou preco nao positivo: tratar como falha do ativo.
- Falha de persistencia: retornar erro da atualizacao sem apagar o cache
  anterior.
- Sem cache: manter `price = null`, `timestamp = null` e apresentar `-`.

Alertas desta fase sao apenas avisos tecnicos de disponibilidade da cotacao;
nenhuma ordem ou recomendacao sera executada.

## Testes e validacao

Backend:

- deduplicacao e normalizacao dos ativos abertos;
- exclusao de operacoes encerradas;
- consulta em lote no provedor;
- ausencia de token sem chamada externa;
- resposta parcial;
- preservacao do cache em falhas;
- persistencia de sucesso e erro;
- bloqueio de atualizacoes simultaneas;
- classificacao de CALL e PUT;
- margem ATM e cotacao ausente ou zero.

Frontend:

- chamada inicial e atualizacao manual global;
- bloqueio durante atualizacao;
- exibicao de `-` e avisos;
- reutilizacao da cotacao para pernas do mesmo ativo;
- ausencia de `BRAPI_TOKEN` no bundle.

Validacao da fase:

```bash
cd backend && npm run build && npm run lint && npm test
cd ../frontend && npm run build && npm run lint && npm test
cd ../backend && npx prisma validate
```
