---
id: QB-20260910-trace-status-prune
type: feature
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Trace status statistics and explicit pruning

## Goal

Expose useful global Trace storage statistics in Pi's existing extension status line and add an explicit, guarded CLI operation for deleting retained Trace events and optionally reclaiming SQLite disk space.

## Scope

- Extend the independent TUI status line with the global `trace_events` count and physical SQLite storage size.
- Refresh statistics periodically without coupling collection success to UI/query success.
- Add `qb-trace prune` with explicit age or all-data selectors, dry-run support, recording-state protection, and optional vacuuming.
- Preserve recording controls, configuration, and diagnostics during pruning.
- Document operational and recovery behavior.

## Non-goals

- Automatic retention, background pruning, quotas, or payload reduction.
- Pruning recording-control audit rows or diagnostics.
- Session-specific pruning in this version.
- Changing SQLite schema 1.
- Replacing Pi's default footer.

## Constraints and assumptions

- SQLite remains the sole authoritative global Trace store and continues to use WAL/schema 1.
- Statistics are eventually consistent across concurrently running Pi processes.
- Manual pruning is intentionally destructive; selection must be explicit and dry-run must be available.
- Actual pruning requires the global recording config to be off. A bounded grace period may be used to allow existing runtimes to observe the switch and drain queued writes.
- `VACUUM` is a separate post-delete operation: deletion may succeed even when compaction fails.
- User authorization: the user accepted the evaluated status/prune design and explicitly requested implementation on 2026-09-10.

## Requirements

- REQ-001: In TUI mode, the QB Trace status line shall show recording on/off, total persisted Trace event count, and physical database storage size; non-TUI modes shall not render it.
- REQ-002: The recording state shall retain its current prompt update behavior, while count and size shall refresh no more frequently than once every five seconds and a statistics failure shall not affect collection.
- REQ-003: `qb-trace prune` shall require exactly one explicit selector: `--older-than <positive integer><h|d>` or `--all`; malformed, missing, or conflicting selectors shall not mutate data.
- REQ-004: `--dry-run` shall report matched event count and payload bytes without deleting or compacting data and may run while recording is on.
- REQ-005: A mutating prune shall refuse while recording configuration is on and shall transactionally delete only matching rows from `trace_events` after a bounded off-propagation grace period.
- REQ-006: Pruning shall preserve `recording_controls`, `config.json`, and runtime diagnostics and shall not change database schema version.
- REQ-007: Prune output shall report deleted/matched events, remaining events, payload bytes, and physical database size with truthful non-zero exit behavior on failure.
- REQ-008: `--vacuum` shall run WAL checkpoint/truncation and SQLite `VACUUM` only after a successful deletion; if compaction fails, the CLI shall report that deletion succeeded but space reclamation failed and return non-zero without repeating deletion.
- REQ-009: Existing collection, query, on/off/status, security permissions, and fail-open behavior shall remain compatible.

## Acceptance criteria

- AC-001 [REQ-001, REQ-002]: A TUI session displays `● trace on · <count> events · <size>` or `○ trace off · <count> events · <size>`, observes on/off changes, and refreshes external database count/size changes within five seconds without collection failure when statistics are unavailable.
- AC-002 [REQ-003]: Missing, malformed, unknown, duplicate, or conflicting prune arguments return usage/error status and leave all rows unchanged.
- AC-003 [REQ-004]: Both age-selected and all-selected dry runs return matching statistics while leaving events and database contents unchanged, including while recording is enabled.
- AC-004 [REQ-005, REQ-006]: Mutating prune refuses when recording is enabled; when disabled it deletes exactly the committed rows selected at transaction time and preserves controls, schema, config, and diagnostics.
- AC-005 [REQ-007]: Successful prune output reports matched/deleted/remaining counts, payload bytes, and before/after physical size.
- AC-006 [REQ-008]: `--vacuum` is not run during dry-run or failed deletion; successful deletion followed by compaction failure is reported as partial success with a non-zero exit code.
- AC-007 [REQ-009]: Existing automated adapter, collector, store, config, query, CLI, and type checks continue to pass.

## Behavior Delta

### ADDED

- REQ-001: The existing independent Trace status line additionally exposes persisted global event count and physical storage size.
- REQ-003: The CLI accepts explicit age-based or all-event manual prune selections.
- REQ-004: Prune supports a non-mutating dry-run.
- REQ-008: Prune optionally compacts SQLite storage after deletion.

### MODIFIED

- REQ-006: The prior append-only/no-retention contract is narrowed to prohibit automatic retention while allowing explicitly requested, guarded manual deletion of `trace_events`; controls and diagnostics remain retained.

## Risks and recovery

- A process that has not yet observed `off` may finish draining queued events. Prune waits a bounded grace period, deletes a transactional snapshot, and reports the actual remaining count rather than promising permanent zero.
- `DELETE` does not necessarily shrink the main SQLite file. `--vacuum` is explicit because it may require additional temporary disk and exclusive access.
- If deletion fails, its transaction rolls back. If vacuum fails after commit, deleted rows cannot be restored; the CLI must distinguish this partial-success state.
- Recovery for accidental deletion is restoration from an external backup; the project does not create automatic backups in this scope.

## Blockers

None.
