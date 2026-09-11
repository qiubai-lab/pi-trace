# Directory Map

## Root Directories

- `src/`: QB Trace runtime, CLI, storage/query capabilities, HTTP adapters, analysis projections, and the React application; it does not contain generated runtime data.
- `src/analysis/`: framework-independent Session projection rules; it does not depend on React, HTTP, or SQLite.
- `src/server/`: authenticated read-only HTTP transport and SSE routing; it does not own storage or analysis semantics.
- `src/web/`: React Session workbench source and feature modules; it has no database or mutation capability.
- `bin/`: thin user executable entrypoints; it does not own tracing policy or schema.
- `scripts/`: explicit installation and benchmark helpers; installation helpers never run automatically during package loading.
- `dist/web/`: generated production Web assets; it is recreated by `npm run build:web` and is not a source-of-truth directory.
- `docs/qb-spec/context/`: approved stable architecture facts; current-change requirements remain in the active spec.

## Important Files

- `package.json`: package identity, Pi extension resource, frontend build, and reproducible checks.
- `src/index.ts`: Pi lifecycle adapter and runtime composition root.
- `src/cli-entry.ts` and `bin/qb-trace`: standalone CLI process entrypoints.
- `src/server.ts`: loopback HTTP composition and lifecycle root.
- `src/server/routes.ts`: bounded authenticated API and SSE route adapter.
- `src/contracts.ts`: canonical API DTO contracts shared by server projections and the Web build.
- `src/analysis/projections.ts`: timeline hierarchy and conversation projection semantics.
- `src/query.ts`: cursor-paginated read-only application query boundary.
- `src/store.ts`: exclusive SQLite schema, SQL, and write ownership.
- `src/web/main.tsx`: React browser entrypoint.
- `src/web/app/App.tsx`: Session workbench composition root.
- `vite.config.ts`, `tsconfig.web.json`, and `vitest.config.ts`: executable frontend/build/test configuration.
- `README.md`: installation, operation, security, and development entrypoints.

## Module Responsibilities

- Collection path (`index`, `events`, `collector`, `config`, `diagnostics`) records complete callback-visible events with bounded fail-open behavior and never depends on Server/UI modules.
- Persistence/query path (`store`, `query`) owns SQLite and bounded read contracts; callers do not issue SQL directly.
- Analysis path (`analysis`) translates recorded events into source-linked presentation projections without fabricating missing content.
- HTTP path (`server.ts`, `server/`) enforces loopback, ephemeral authentication, security headers, read-only routing, static asset delivery, and stream cleanup.
- Web path (`web/`) owns remote-state presentation, workspace URL state, virtualization, interaction, and visual design; it consumes only HTTP/DTO contracts.
- CLI path (`cli`, `cli-entry`, `bin`) owns explicit user commands and composes capabilities without absorbing their policies.

## Forbidden Contents By Directory

- `src/web/`: no SQLite imports, filesystem access, recording/prune controls, secrets in URL query/path, remote scripts/fonts, or duplicated storage models.
- `src/server/`: no SQLite statements, conversation interpretation, collector control, or writable Web routes.
- `src/analysis/`: no React components, HTTP request/response objects, SQLite rows, or guessed conversation content.
- `src/store.ts`: no HTTP DTO formatting or UI-specific grouping decisions.
- `bin/` and `scripts/`: no tracing policy or SQLite schema ownership.
- Repository-wide: no imports from another Pi package's private files and no generated Trace databases, runtime configuration, credentials, or diagnostics.
