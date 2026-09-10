---
id: QB-20260910-automatic-prune-pause
type: bugfix
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Automatic recording pause for prune

## Observed behavior

A user running `qb-trace prune --all` while Trace recording is on receives a refusal, so neither deletion nor the default vacuum runs. The global database can therefore retain a large physical file even after earlier logical deletion. On 2026-09-10 the observed database had a 338MB main file, only tens of events, and recording remained on.

## Expected behavior

A mutating prune should safely pause recording itself, wait for loaded runtimes to observe the pause and drain queued writes, prune and vacuum, then restore the recording state that existed before the command. Dry-run remains read-only and does not alter recording state.

## Scope

- Automatically pause global recording for mutating prune when it starts on.
- Audit automatic pause/resume boundaries when the database is available.
- Preserve the existing grace period, state recheck, transactional deletion, default vacuum, and partial-success reporting.
- Restore the original on state after success or failure unless another process/user changed the config after the automatic pause.
- Explain automatic behavior and accurate failure/recovery output.

## Non-goals

- Stopping Pi processes or closing their SQLite handles.
- Automatic retry of failed vacuum operations.
- Changing schema 1, prune selectors, dry-run behavior, or retained tables.
- Overwriting a concurrent explicit recording-state decision.

## Requirements

- REQ-001: A mutating prune started while recording is on shall atomically set recording off, wait the existing bounded grace period, and recheck off before opening the deletion transaction.
- REQ-002: After prune success or failure, the CLI shall restore the original on state only when the config still matches the automatic pause written by that command; a concurrent config write shall be preserved instead.
- REQ-003: Automatic pause and successful restoration shall be appended to `recording_controls` with a prune-specific source when the Trace database is available, without placing those rows inside the deletion scope.
- REQ-004: Dry-run shall not change config or append automatic pause/resume controls.
- REQ-005: Deletion, default checkpoint/vacuum, partial-success semantics, schema, permissions, and retained config/control/diagnostic boundaries shall remain compatible.
- REQ-006: CLI output and exit status shall distinguish prune/vacuum failure from failure to restore recording, and shall report whether recording was restored or a concurrent decision was preserved.

## Acceptance criteria

- AC-001 [REQ-001, REQ-003]: With recording initially on, mutating prune observes off during its grace wait, executes deletion/default compaction, records a prune pause boundary, and does not require a prior manual `off` command.
- AC-002 [REQ-002, REQ-003]: Success and injected vacuum failure both restore the initial on state and audit restoration when no concurrent config write occurred.
- AC-003 [REQ-002, REQ-006]: A concurrent off or on write after automatic pause is not overwritten; output identifies preserved concurrent state and exit behavior remains truthful.
- AC-004 [REQ-004]: Age/all dry-run leaves config and control count unchanged while recording is on.
- AC-005 [REQ-005, REQ-006]: Existing prune selection, transaction, default vacuum, partial-success, schema, security, status, and collection tests remain green.

## Behavior Delta

### MODIFIED

- REQ-001: Replaces the prior recording-on refusal with an automatic bounded pause before mutating prune.
- REQ-002: Adds conditional restoration of the pre-prune on state while protecting concurrent explicit config writes.

## Risks and recovery

- Process crashes after automatic pause can leave recording off; CLI output documents the state and `qb-trace on` remains the recovery command.
- A process may retain an idle SQLite connection; SQLite busy timeout and truthful vacuum failure reporting remain in force.
- Deleted events remain unrecoverable without an external backup.

## Authorization

The user explicitly requested pruning without manually disabling Trace on 2026-09-10.
