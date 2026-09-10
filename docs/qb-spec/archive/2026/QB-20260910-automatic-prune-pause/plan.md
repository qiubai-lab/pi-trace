---
id: QB-20260910-automatic-prune-pause
type: bugfix
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Implementation plan

## Boundary decision

- `src/cli.ts` owns temporary recording-state orchestration and user-facing recovery semantics.
- `src/config.ts` continues to own atomic config persistence; add only a stable file-identity read needed to detect concurrent writes.
- `src/store.ts` continues to own control audit writes, deletion transactions, and vacuum.
- Collector and TUI status behavior remain consumers of the global config and require no pruning dependency.

## Tasks

- TASK-001 [REQ-001, REQ-002, AC-001, AC-002, AC-003] Add tests for automatic pause, grace-time off state, restoration on success/failure, and concurrent config-write preservation.
- TASK-002 [REQ-003, REQ-004, AC-001, AC-004] Add prune-specific control boundaries and prove dry-run does not change config or controls.
- TASK-003 [depends: TASK-001, TASK-002] [REQ-005, REQ-006, AC-002, AC-003, AC-005] Implement guarded orchestration with truthful combined prune/vacuum/restore outcomes while preserving existing store boundaries.
- TASK-004 [depends: TASK-003] [REQ-005, AC-005] Update operational documentation and durable architecture context.

## Verification

- VER-001 [AC-001] CLI test starts recording on, confirms off inside the injected grace wait, then confirms deletion, default compaction, and pause audit.
- VER-002 [AC-002] CLI tests confirm initial on is restored after success and injected post-delete vacuum failure.
- VER-003 [AC-003] CLI tests perform concurrent config writes after auto-pause and confirm they are not overwritten.
- VER-004 [AC-004] Dry-run tests compare config and controls before/after.
- VER-005 [AC-005] Run full tests, typecheck, shell syntax checks, `git diff --check`, package discovery, and an isolated real CLI prune while recording starts on.

## Recovery

- If automatic restoration fails, return non-zero, print `qb-trace on` as the recovery action, and do not conceal any already-committed deletion.
- No schema migration is introduced; code rollback restores prior manual-off behavior.

## Implementation result

- TASK-001 completed: mutating prune captures the initial recording state, writes an atomic temporary off state, fingerprints that config revision, waits, rechecks, and restores on only if the revision is unchanged.
- TASK-002 completed: successful automatic pause/resume boundaries use source `qb-trace-cli:prune`; dry-run returns before all config/control mutations.
- TASK-003 completed: default vacuum and prior partial-success reporting remain in the store/CLI boundaries; concurrent on aborts deletion and concurrent off is preserved.
- TASK-004 completed: README and architecture context describe automatic pause, conditional restoration, and recovery.

## Verification evidence

- VER-001 through VER-004: focused config/CLI tests cover same-value revision changes, off during the injected grace wait, successful automatic pause/deletion/compaction/restore, pause/resume audits, dry-run immutability, concurrent off preservation, concurrent on abort, and restoration after injected vacuum failure.
- VER-005: `npm test` passed 8 files / 32 tests; `npm run typecheck`, shell syntax checks, and `git diff --check` passed; `pi -ne -e . --list-models` completed successfully.
- Isolated operational smoke: starting from recording on, `qb-trace prune --all` automatically paused, deleted one event, reduced the database from 49,152 to 40,960 bytes through default vacuum, restored recording on, retained schema 1 with zero events, and persisted control sequence `on -> prune off -> prune on`.

## Acceptance result

- AC-001 through AC-005: PASS. No blocked verification remains.
