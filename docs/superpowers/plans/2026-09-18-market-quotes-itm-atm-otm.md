# Market Quotes and ITM/ATM/OTM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional-token brapi quotes, persistent per-asset cache, global refresh, and open-position ITM/ATM/OTM indicators without changing closed operation history.

**Architecture:** The backend will expose a provider-independent `MarketDataProvider`, a brapi adapter, and a quote service that owns asset discovery, cache updates, partial failures, and the refresh lock. The frontend will consume quote snapshots from the backend and render global refresh state plus derived indicators for open operations; closed operations will not receive market updates.

**Tech Stack:** TypeScript, Fastify, Prisma/PostgreSQL, Decimal.js, Vitest, React 19, Material UI, Vite.

**Spec:** `docs/superpowers/specs/2026-09-18-market-quotes-itm-atm-otm-design.md`

## Global Constraints

- `BRAPI_TOKEN` is optional and must remain backend-only.
- No external quote request is made when `BRAPI_TOKEN` is absent or empty.
- Cache is one current row per asset; no quote history is added.
- Failed responses never replace a valid cached price or timestamp.
- Only operations with `closedAt = null` participate in quote refresh and market indicators.
- Missing, null, zero, or invalid prices render as `-` and produce no classification or distance.
- ATM uses a configurable default margin of `1%`.
- A second refresh while one is running returns `409 QUOTES_REFRESH_IN_PROGRESS`.
- Do not modify or recalculate realized values of closed operations.
- Do not commit changes unless the user explicitly requests a commit.

---

## File Map

### Backend

- Create `backend/src/modules/quotes/types.ts`: provider, cache, response, and warning types.
- Create `backend/src/modules/quotes/provider.ts`: `MarketDataProvider` contract and `BrapiMarketDataProvider` implementation.
- Create `backend/src/modules/quotes/repository.ts`: Prisma access for current quote rows and bulk upserts.
- Create `backend/src/modules/quotes/service.ts`: refresh orchestration, lock, asset discovery, cache preservation, and response serialization.
- Create `backend/src/modules/quotes/routes.ts`: `GET /quotes` and `POST /quotes/refresh`.
- Create `backend/src/shared/market/classification.ts`: decimal-safe distance and option classification functions.
- Modify `backend/prisma/schema.prisma`: add `AssetQuote`.
- Modify `backend/src/config/env.ts`: expose optional `brapiToken`.
- Modify `backend/src/app.ts`: register quote routes and dependencies.
- Modify `backend/.env.example`: document optional `BRAPI_TOKEN`.
- Modify `backend/src/modules/operations/repository.ts`: list distinct assets for open operations.
- Create or modify backend quote and classification tests under `backend/tests/`.

### Frontend

- Modify `frontend/src/services/api/client.ts`: quote response types and `getQuotes`/`refreshQuotes` clients.
- Modify `frontend/src/types/operations.ts`: optional market indicator fields if indicators are attached to view models.
- Create `frontend/src/shared/market/classification.ts`: presentation-side decimal-safe indicator calculation from quote snapshots.
- Modify `frontend/src/pages/Positions.tsx`: automatic/manual global refresh, quote state, indicators, warnings, and stale-cache display.
- Modify `frontend/src/services/api/client.test.ts`: request and response behavior for quote endpoints.

### Documentation

- Use the approved design at `docs/superpowers/specs/2026-09-18-market-quotes-itm-atm-otm-design.md` as the source of truth.
- Do not expose `BRAPI_TOKEN` in frontend `.env.example`, React code, or Vite output.

---

## Task 1: Configuration and Database Cache

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: Prisma migration generated from the schema change
- Test: `backend/tests/quotes.test.ts`

**Interfaces:**
- Produces `env.brapiToken: string | undefined`.
- Produces Prisma model `AssetQuote` with unique `asset`, nullable `price` and `timestamp`, `source`, `delayed`, `lastError`, `createdAt`, and `updatedAt`.

- [ ] **Step 1: Write the failing configuration/cache test**

Add tests asserting that the environment parser accepts an absent token and
that a cache record can represent no price while retaining an error. Keep the
test isolated from the real database by testing the quote repository against a
small Prisma mock in later steps.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
cd backend && npx vitest run tests/quotes.test.ts
```

Expected: failure because the quote model and `env.brapiToken` do not exist.

- [ ] **Step 3: Add the optional environment variable and Prisma model**

Use:

```typescript
brapiToken: process.env.BRAPI_TOKEN || undefined,
```

Add `AssetQuote` with `asset String @unique`, `price Decimal? @db.Decimal(18, 6)`,
`timestamp DateTime?`, `source String`, `delayed Boolean @default(true)`,
`lastError String?`, and standard timestamps. Add `BRAPI_TOKEN=` with a comment
that it is optional and backend-only to `.env.example`.

- [ ] **Step 4: Generate the migration and verify schema validity**

Run:

```bash
cd backend && npx prisma migrate dev --name add_asset_quotes && npx prisma validate
```

Expected: migration generated and schema valid.

---

## Task 2: Decimal-Safe Market Classification

**Files:**
- Create: `backend/src/shared/market/classification.ts`
- Create: `backend/tests/classification.test.ts`
- Create: `frontend/src/shared/market/classification.ts`

**Interfaces:**
- Backend `calculateDistance(price: string, strike: string): { absolute: string; percentage: string } | null`.
- Backend `classifyOption(optionType: "CALL" | "PUT", price: string, strike: string, atmMarginPercentage?: string): "ITM" | "ATM" | "OTM" | null`.
- Frontend helper exposes the same input and output behavior for rendering.

- [ ] **Step 1: Write failing tests for the domain rules**

Cover these exact cases: PUT below strike is ITM, PUT above strike is OTM,
CALL above strike is ITM, CALL below strike is OTM, a price within 1% is ATM,
price `0` returns `null`, and distance percentage uses
`abs(price - strike) / price * 100`.

- [ ] **Step 2: Run the classification tests and verify they fail**

```bash
cd backend && npx vitest run tests/classification.test.ts
```

Expected: module/function-not-found failures.

- [ ] **Step 3: Implement minimal Decimal.js-based functions**

Do not use JavaScript floating-point arithmetic. Return decimal strings and
return `null` before division when price is absent or zero. Apply ATM before
the directional ITM/OTM rule.

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd backend && npx vitest run tests/classification.test.ts
```

Expected: all classification tests pass.

---

## Task 3: Provider Abstraction and Brapi Adapter

**Files:**
- Create: `backend/src/modules/quotes/types.ts`
- Create: `backend/src/modules/quotes/provider.ts`
- Create: `backend/tests/quotes-provider.test.ts`

**Interfaces:**
- `AssetQuote { asset: string; price: string; timestamp: string; source: string; delayed: boolean }`.
- `MarketDataProvider { getQuotes(assets: string[]): Promise<AssetQuote[]> }`.
- `BrapiMarketDataProvider` constructor accepts `{ token?: string; fetch?: typeof globalThis.fetch }`.

- [ ] **Step 1: Write failing provider tests**

Test that the adapter builds one batch request for `BBSE3,PETR4`, sends the token
only in the backend request, maps `symbol`, `regularMarketPrice`, and
`regularMarketTime`, rejects invalid/non-positive prices, and returns an empty
result without invoking `fetch` when the token is absent.

- [ ] **Step 2: Run the provider tests and verify failure**

```bash
cd backend && npx vitest run tests/quotes-provider.test.ts
```

Expected: missing provider implementation failures.

- [ ] **Step 3: Implement the adapter**

Call `https://brapi.dev/api/quote/<comma-separated-assets>?token=<token>` only
when a token exists. Normalize symbols to uppercase, map valid positive market
prices to strings, and use `source: "brapi"` and `delayed: true`. Throw a
provider error for transport or malformed response failures so the service can
preserve cache values.

- [ ] **Step 4: Run provider tests and verify they pass**

```bash
cd backend && npx vitest run tests/quotes-provider.test.ts
```

Expected: all provider tests pass and no real network request is made.

---

## Task 4: Quote Repository and Refresh Service

**Files:**
- Create: `backend/src/modules/quotes/repository.ts`
- Modify: `backend/src/modules/operations/repository.ts`
- Create: `backend/src/modules/quotes/service.ts`
- Modify: `backend/tests/quotes.test.ts`

**Interfaces:**
- `QuoteRepository.findByAssets(assets: string[]): Promise<QuoteRecord[]>`.
- `QuoteRepository.findAll(): Promise<QuoteRecord[]>`.
- `QuoteRepository.upsertSuccess(quote: AssetQuote): Promise<QuoteRecord>`.
- `QuoteRepository.recordFailure(asset: string, message: string): Promise<QuoteRecord>`.
- `QuoteService.getAll(): Promise<QuoteResponse>`.
- `QuoteService.refresh(): Promise<QuoteResponse>`.

`QuoteResponse` contains `data: QuoteView[]`, `updatedAt: string | null`, and
`warnings: QuoteWarning[]`; `QuoteView.price` and `timestamp` are nullable.

- [ ] **Step 1: Write failing service tests**

Use an injected provider and Prisma mock. Test deduplication of repeated open
assets, exclusion of closed operations, successful batch persistence, partial
failure preserving the prior price/timestamp, missing token returning cache
without provider invocation, uncached assets returning null values, and a
second concurrent refresh rejecting with an `AppError` code of
`QUOTES_REFRESH_IN_PROGRESS`.

- [ ] **Step 2: Run the service tests and verify failure**

```bash
cd backend && npx vitest run tests/quotes.test.ts
```

Expected: missing repository/service failures.

- [ ] **Step 3: Implement repository asset discovery and cache operations**

Add an operation repository method that selects only distinct assets from
`closedAt: null`. Implement quote reads by asset, bulk cache reads, success
upserts that clear `lastError`, and failure updates that only change
`lastError`.

- [ ] **Step 4: Implement refresh orchestration**

Inject the provider and repository dependencies. Normalize and deduplicate
assets, guard the whole refresh with a boolean/in-flight lock, skip provider
calls when no token is available, persist valid successes, record missing or
invalid assets as failures, and serialize current cache rows without ever
writing zero over a valid price.

- [ ] **Step 5: Run service tests and verify they pass**

```bash
cd backend && npx vitest run tests/quotes.test.ts
```

Expected: all refresh, fallback, and concurrency tests pass.

---

## Task 5: Quote HTTP API and App Wiring

**Files:**
- Create: `backend/src/modules/quotes/routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/integration/quotes.test.ts`

**Interfaces:**
- `GET /quotes` returns `{ data, updatedAt, warnings }` without contacting brapi.
- `POST /quotes/refresh` returns `{ data, updatedAt, warnings }`.
- Concurrent refresh returns HTTP `409` with error code `QUOTES_REFRESH_IN_PROGRESS`.

- [ ] **Step 1: Write failing integration tests**

Build the app with a Prisma mock and injected provider, then assert GET returns
cache, POST refreshes only open assets, missing token returns a warning, and a
second refresh returns the specified 409 response.

- [ ] **Step 2: Run the integration tests and verify failure**

```bash
cd backend && npx vitest run tests/integration/quotes.test.ts
```

Expected: route-not-found or dependency-wiring failures.

- [ ] **Step 3: Register routes and construct dependencies**

Register quote routes after the existing modules. Construct
`BrapiMarketDataProvider({ token: env.brapiToken })`, inject it into
`QuoteService`, and keep `env.brapiToken` inside backend code only.

- [ ] **Step 4: Run integration tests and verify they pass**

```bash
cd backend && npx vitest run tests/integration/quotes.test.ts
```

Expected: all quote API integration tests pass.

---

## Task 6: Frontend Quote Client and Position Indicators

**Files:**
- Modify: `frontend/src/services/api/client.ts`
- Modify: `frontend/src/services/api/client.test.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/shared/market/classification.ts`
- Modify: `frontend/src/types/operations.ts`
- Modify: `frontend/src/pages/Positions.tsx`

**Interfaces:**
- `getQuotes(): Promise<QuoteResponse>`.
- `refreshQuotes(): Promise<QuoteResponse>`.
- `QuoteView { asset: string; price: string | null; timestamp: string | null; source: string; delayed: boolean; lastError: string | null }`.

- [ ] **Step 1: Write failing frontend client and indicator tests**

Test the exact `/quotes` GET and `/quotes/refresh` POST paths, that refresh
errors are surfaced, and that the presentation helper returns `-` data for a
missing quote and the expected PUT/CALL classification for a valid quote.

- [ ] **Step 2: Run frontend tests and verify failure**

```bash
cd frontend && npx vitest run src/services/api/client.test.ts
```

Expected: missing client/helper failures.

- [ ] **Step 3: Add decimal support and implement quote API types and indicator helper**

Add the existing `decimal.js` package to the frontend dependencies and lockfile
with `npm install decimal.js`. Keep the backend token absent from all frontend
code. Use Decimal.js with the same 1% default ATM rule so indicator arithmetic
does not depend on JavaScript floating-point rounding.

- [ ] **Step 4: Integrate global refresh state into `Positions`**

On initial load, fetch operations and trigger one global refresh. Add one button
whose disabled/loading state is controlled by `refreshingQuotes`; after refresh,
load the quote snapshot and render each open operation's price, absolute
distance, percentage distance, and ITM/ATM/OTM. Display `-` for null/zero
prices, preserve stale cached values when warnings exist, and show the latest
timestamp plus partial-failure warnings.

- [ ] **Step 5: Run frontend tests and verify they pass**

```bash
cd frontend && npx vitest run
```

Expected: existing API tests plus quote client and indicator tests pass.

---

## Task 7: Full Verification and Bundle Safety

**Files:**
- Test: all backend and frontend test files.

- [ ] **Step 1: Verify the token is not present in frontend sources or output**

Run:

```bash
cd frontend && npm run build
rg "BRAPI_TOKEN|brapiToken" src dist
```

Expected: no matches in frontend source or generated bundle.

- [ ] **Step 2: Run complete backend validation**

```bash
cd backend && npm run build && npm run lint && npm test && npx prisma validate
```

Expected: build, lint, tests, and Prisma validation pass. Any unrelated
pre-existing failures must be reported rather than hidden or rewritten.

- [ ] **Step 3: Run complete frontend validation**

```bash
cd frontend && npm run build && npm run lint && npm test
```

Expected: all commands pass.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
```

Confirm that the diff contains only Fase 1 files and the approved design/plan,
and that earlier user changes remain untouched.
