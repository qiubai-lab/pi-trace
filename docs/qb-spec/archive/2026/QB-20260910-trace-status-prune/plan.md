---
id: QB-20260910-trace-status-prune
type: feature
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Implementation plan

## Boundary decision

- Pi/TUI adaptation remains in `src/index.ts`; a focused status component owns polling and presentation without controlling collection.
- `src/store.ts` remains the exclusive owner of mutating SQLite statements and transaction boundaries.
- `src/cli.ts` owns argument validation, recording-off policy, user output, and partial-success exit behavior.
- `src/query.ts` remains read-only. Configuration and diagnostic models remain separate from persisted Trace events.
- Manual prune deliberately narrows the durable append-only contract; no automatic retention is introduced.

## Tasks

- TASK-001 [REQ-001, REQ-002, AC-001] Add focused tests and a TUI status controller that renders recording state, global event count, and physical size; polls at five-second intervals; avoids unchanged renders; and fails open.
- TASK-002 [REQ-003, REQ-004, AC-002, AC-003] Add strict prune argument parsing and dry-run selection reporting, with no-selector/conflicting-selector rejection.
- TASK-003 [depends: TASK-002] [REQ-005, REQ-006, REQ-007, AC-004, AC-005] Add store-owned transactional age/all pruning, recording-off enforcement, bounded propagation grace, preserved non-event data, and truthful result reporting.
- TASK-004 [depends: TASK-003] [REQ-008, AC-006] Add optional post-delete WAL checkpoint and vacuum handling with explicit partial-success reporting.
- TASK-005 [depends: TASK-001, TASK-004] [REQ-009, AC-007] Update README, architecture context, and Directory Map for manual pruning and the status controller; preserve existing commands and schema.

## Verification

- VER-001 [AC-001] Run focused adapter/status tests covering startup, on/off changes, periodic count/size refresh, shutdown cleanup, non-TUI behavior, and query failure isolation.
- VER-002 [AC-002] Run CLI tests proving invalid/missing/conflicting/unknown prune arguments cannot mutate events.
- VER-003 [AC-003] Run CLI/store tests proving age and all dry-runs report matches while preserving rows and operating with recording enabled.
- VER-004 [AC-004] Run store/CLI tests proving recording-on refusal, exact transactional deletion, schema preservation, and retained control records/config/diagnostics.
- VER-005 [AC-005] Assert successful CLI output includes matched/deleted/remaining counts, payload bytes, and physical sizes.
- VER-006 [AC-006] Inject compaction success/failure seams to prove dry-run and failed deletion do not vacuum and post-delete vacuum failure returns partial-success/non-zero output.
- VER-007 [AC-007] Run `npm test`, `npm run typecheck`, `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh`, and `git diff --check`.

## Rollback and recovery

- Code rollback removes the status controller and prune command without a schema migration.
- Failed deletion transactions roll back automatically.
- A successful deletion cannot be reconstructed by this package; restore the database from an external backup if deletion was accidental.
- Vacuum failure does not undo deletion. Retry only space compaction after resolving locks/disk capacity; do not repeat a broader prune selector unintentionally.

## Implementation result

- TASK-001 completed: `src/status.ts` owns TUI-only, fail-open five-second statistics polling and unchanged-render suppression; `src/index.ts` composes and disposes it with the Trace runtime.
- TASK-002 completed: `src/cli.ts` validates one explicit selector and supports dry-run while recording is on.
- TASK-003 completed: `src/store.ts` owns transactional selection/deletion; CLI enforces off, waits 2.5 seconds by default, and rechecks state before mutation.
- TASK-004 completed: optional checkpoint/vacuum is post-commit and reports partial success separately.
- TASK-005 completed: README, architecture context, and Directory Map describe the new behavior without a schema change.

## Verification evidence

- VER-001 through VER-006: `npm test` passed 8 files / 30 tests, including TUI state/stat refresh and failure isolation, non-TUI behavior, argument rejection, dry-run, off/recheck gates, exact age/all deletion, preserved controls/config/diagnostics, schema preservation, successful vacuum, and injected vacuum partial failure.
- VER-007: `npm run typecheck` passed; `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh` passed; `git diff --check` passed.
- Package discovery: `pi -ne -e . --list-models` completed successfully.
- Focused operational smoke test in an isolated `QB_TRACE_HOME` confirmed age dry-run matched one of two events, mutating age prune deleted exactly one, `--vacuum` reduced physical storage from 73,728 to 40,960 bytes, and `status` reported schema 1 with one remaining event.

## Acceptance result

- AC-001 through AC-007: PASS. No blocked or unverified acceptance remains.
