# Directory Map

## Root directories

- `src/`: QB Trace implementation and colocated tests; owns Pi adaptation, tracing policy, storage and CLI use cases.
- `bin/`: thin user executable entrypoints; does not own tracing policy or schema.
- `scripts/`: explicit installation helpers; never runs automatically during package loading.
- `docs/qb-spec/context/`: stable architecture facts for independent maintenance.

## Important files

- `package.json`: package identity, the single Pi extension resource and reproducible checks.
- `src/index.ts`: Pi lifecycle adapter and Runtime composition root.
- `src/events.ts`: lossless serialization, event envelopes and correlation.
- `src/collector.ts`: bounded asynchronous collection and fail-open behavior.
- `src/store.ts`: versioned global SQLite persistence, transactional manual pruning, compaction and write ownership.
- `src/query.ts`: cursor-paginated read-only query boundary and Web-safe DTO composition.
- `src/server.ts`: localhost-only authenticated HTTP API, SSE lifecycle and security boundary.
- `src/web.ts`: bundled dependency-free local dashboard assets.
- `src/status.ts`: fail-open TUI recording/count/size status and bounded polling.
- `src/config.ts`: atomic global recording state and live propagation.
- `src/diagnostics.ts`: database-independent loss/error state.
- `src/cli.ts`: standalone on/off/status/prune/server use cases, Server option adapter and prune safety policy.
- `bin/qb-trace`: package-owned executable shim.
- `scripts/install-qb-trace-cli.sh`: guarded user-level symlink installer and legacy-link migration.
- `README.md`: installation, migration, operation, security and development guidance.

## Forbidden contents

- No imports from `pi-plugins` or another package's private files.
- No Web UI or writable Trace Server in V1.
- No tracing policy or SQLite schema logic in `bin/` or `scripts/`.
- No generated Trace database, runtime configuration, credentials or diagnostics in the repository.
