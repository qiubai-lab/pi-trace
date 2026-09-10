---
id: QB-20260910-default-prune-vacuum
type: feature
tier: standard
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Default prune vacuum

## Goal

Make mutating `qb-trace prune` reclaim SQLite disk space by default so users do not retain a large mostly-empty database after deleting Trace events.

## Scope

- Run WAL checkpoint and `VACUUM` after every successful mutating prune, including when zero rows currently match.
- Keep `--vacuum` accepted for backward compatibility.
- Keep dry-run non-mutating and preserve existing partial-success reporting when deletion commits but compaction fails.

## Non-goals

- An opt-out flag for compaction.
- Changing prune selectors, recording-off protection, retained tables, or schema 1.

## Requirements

- REQ-001: Every successful non-dry-run prune shall checkpoint WAL and execute `VACUUM` by default, whether or not `--vacuum` is present.
- REQ-002: Dry-run shall never checkpoint or vacuum, and `--vacuum` shall remain accepted for command compatibility.
- REQ-003: A default vacuum failure after committed deletion shall retain the existing truthful partial-success output and non-zero exit status.

## Acceptance criteria

- AC-001 [REQ-001]: A mutating prune without `--vacuum` invokes database compaction and reports `vacuum: complete` on success.
- AC-002 [REQ-002]: Dry-run does not invoke compaction, while explicit `--vacuum` remains valid.
- AC-003 [REQ-003]: Injected compaction failure without `--vacuum` leaves deletion committed, reports partial success, and returns non-zero.
- AC-004 [REQ-001, REQ-002, REQ-003]: Existing tests, typecheck, shell checks, and isolated CLI smoke checks pass.

## Behavior Delta

### MODIFIED

- REQ-001: Replaces opt-in `--vacuum` behavior with automatic compaction after every mutating prune; explicit `--vacuum` remains compatible.

## Implementation steps

- Update prune argument defaults and retain explicit-flag parsing compatibility.
- Update focused CLI tests for default success, dry-run exclusion, and default partial failure.
- Update README and durable architecture wording.
- Run focused and full verification.

## Verification mapping

- AC-001: CLI test with an injected compaction spy and a mutating prune lacking `--vacuum`.
- AC-002: Existing dry-run tests plus explicit-flag compatibility test.
- AC-003: Existing partial-success test changed to omit `--vacuum`.
- AC-004: `npm test`, `npm run typecheck`, shell syntax check, `git diff --check`, and isolated `QB_TRACE_HOME` smoke test.

## Authorization

The user explicitly requested default `--vacuum` behavior on 2026-09-10.

## Implementation and verification evidence

- The prune parser now enables compaction for every mutating invocation while retaining one explicit `--vacuum` flag for compatibility; dry-run returns before all mutation and compaction paths.
- Focused CLI coverage proves default compaction success, dry-run exclusion, recording-on refusal, explicit-flag compatibility, and default post-delete partial failure.
- `npm test` passed 8 files / 30 tests.
- `npm run typecheck`, shell syntax checks for `bin/qb-trace` and the installer, and `git diff --check` passed.
- An isolated real CLI smoke test ran `qb-trace prune --all` without `--vacuum`, deleted one event, reported `vacuum: complete`, reduced physical storage from 49,152 to 40,960 bytes, and retained schema 1 with zero events.

AC-001 through AC-004: PASS. No blocked verification remains.
