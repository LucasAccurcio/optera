# Repository guidance

- There is no root npm workspace: `backend/` and `frontend/` have separate manifests and lockfiles. Run npm commands in the relevant package directory and use Node.js 22+.
- Frontend starts at `frontend/src/main.tsx`; `frontend/src/App.tsx` wires pages, and shared market logic is in `frontend/src/shared/market/`.
- Backend starts at `backend/src/server.ts`; `backend/src/app.ts` registers Fastify routes. Domain code is grouped in `backend/src/modules/<domain>/` (routes, services, repositories, schemas). `buildApp` accepts injected Prisma and quote-provider dependencies for tests.
- Preserve financial precision: API prices/results are decimal strings; use `decimal.js` for calculations.

## Setup and verification

- Backend local development requires PostgreSQL. Start it with `docker compose up -d postgres`; from `backend/`, copy `.env.example` to `.env`, then run `npm ci`, `npm run prisma:generate`, and `npm run prisma:migrate`.
- From `frontend/`, copy `.env.example` to `.env` and run `npm ci`. Run each package's dev server with `npm run dev`; the full stack can also be started with `docker compose up --build` from the root.
- Keep real credentials out of tracked files and logs. `BRAPI_TOKEN` is optional; configure it locally, not in source or documentation.
- Backend checks (from `backend/`): `npm test`, `npm run test:integration`, `npm run lint`, `npm run build`. Integration tests inject in-memory Prisma doubles and do not require PostgreSQL.
- Frontend checks (from `frontend/`): `npm test`, `npm run lint`, `npm run build`.
- Run one test file with `npx vitest run <path>` from its package directory (for example, `npx vitest run src/shared/market/dte.test.ts` from `frontend/`).
