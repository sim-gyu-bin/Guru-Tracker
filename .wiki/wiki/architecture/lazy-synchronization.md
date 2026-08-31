---
title: Lazy Synchronization
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# Lazy Synchronization

## Decided facts

**Scheduled synchronization is primary; access synchronization is fallback.** Supabase Cron invokes the protected internal sync endpoint hourly. The access path first renders cached database data and calls the same sync coordinator only when a source is stale or the scheduled job is behind.

Both triggers use one idempotent coordinator under a database lease, so a concurrent scheduled or access request does not create a separate synchronization flow. The coordinator checks only changed documents, validates candidates, atomically rotates snapshots, and refreshes the UI after a validated update. A dataset version increases only for an actual source change. Source-specific freshness and evidence rules are summarized in [data freshness](../concepts/data-freshness.md) and [source provenance](../concepts/source-provenance.md).

## Deferred / open questions

Staleness thresholds, lease behavior, retry policy, timeout behavior, and how a live UI receives completion are undecided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — superseded access-only trigger and retained update rules.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — primary scheduled trigger and shared coordinator decision.
