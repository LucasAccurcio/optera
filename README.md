# Optera

Fundação do MVP de controle de opções, com frontend React/Vite, API Fastify e PostgreSQL via Prisma.

## Requisitos

- Node.js 22 LTS ou superior
- Docker e Docker Compose

## Execução local

```bash
docker compose up -d postgres
cd backend && cp .env.example .env && npm install && npm run prisma:generate && npm run prisma:migrate
cd ../frontend && cp .env.example .env && npm install
```

Em terminais separados, execute `npm run dev` dentro de `backend/` e `frontend/`. Para subir a stack completa: `docker compose up --build`.

Use `docker compose logs -f backend` para acompanhar a API. Se a porta `5432` estiver ocupada, defina `POSTGRES_PORT` no ambiente do Compose.

## Contrato inicial

- A API usa o endpoint `/health` sem prefixo adicional.
- Datas são ISO 8601; UUIDs identificam entidades persistidas.
- Valores financeiros serão transportados como strings quando os endpoints de domínio forem implementados.
- Erros seguem `{ "error": { "code": "...", "message": "...", "details": [] } }`.
- Paginação e filtros seguem os parâmetros documentados nos endpoints de operações abaixo.

### Operações

- `GET /operations`: lista operações com `status`, `asset`, `optionType`, `side`, `strategyId`, `expirationFrom`, `expirationTo`, `page`, `pageSize`, `sortBy` e `sortOrder`.
- `GET /operations/:id`: consulta uma operação.
- `POST /operations`: cria uma operação e calcula `simulatedClosingPrice` automaticamente.
- `PATCH /operations/:id`: edita uma operação aberta.
- `DELETE /operations/:id`: remove uma operação.
- `POST /operations/:id/close`: encerra uma operação com data e preço efetivo.

Resultados financeiros e preços são retornados como strings para preservar precisão. Operações encerradas não aceitam edição ou nova simulação.

### Estratégias

- `GET /strategies` e `GET /strategies/:id`: listam estratégias com suas pernas e consolidado financeiro.
- `POST /strategies`, `PATCH /strategies/:id` e `DELETE /strategies/:id`: gerenciam estratégias sem excluir as operações associadas.
- `POST /strategies/:id/operations`: associa uma operação como perna.
- `DELETE /strategies/:id/operations/:operationId`: remove a associação sem excluir a operação.

O consolidado usa o preço efetivo nas pernas encerradas e o preço simulado nas pernas abertas.

### Importação

- `POST /imports/operations?mode=preview`: valida o arquivo `.xlsx` e retorna a prévia sem gravar.
- `POST /imports/operations?mode=commit`: grava as linhas válidas da prévia, ignorando duplicidades.

O fluxo rejeita campos obrigatórios inválidos com número da linha e motivo, ignora linhas vazias e cria operações sem estratégia associada.

### Resumo

- `GET /summary`: retorna operações abertas e encerradas, resultados realizado e simulado, operações lucrativas e com prejuízo, além de prêmios recebidos e pagos.

### Validação

- Testes HTTP automatizados: `cd backend && npm run test:integration`.
- Checklist de validação manual: [`docs/VALIDACAO_MVP.md`](docs/VALIDACAO_MVP.md).

Credenciais reais não devem ser versionadas. Os arquivos `.env.example` contêm apenas valores de desenvolvimento.
