---
title: Data Freshness
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# Data Freshness

## Decided facts

**Scheduled synchronization is primary; access synchronization is fallback.** The hourly scheduled path is the normal freshness check. On access, cached database data is shown first, and the shared coordinator is invoked only when a source is stale or the scheduled job is behind. It checks only changed documents. A changed dataset version signals an actual source change, not merely a scheduled run or user access; see [lazy synchronization](../architecture/lazy-synchronization.md).

Freshness is source-aware: SEC 13F is not real-time, and ARK history missed while neither the scheduled nor fallback sync runs cannot be reconstructed; see [data limitations](../operations/data-limitations.md).

## Deferred / open questions

No stale duration, source-specific timestamp semantics, clock policy, scheduled-job-behind threshold, or user-facing freshness wording has been chosen.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained source-freshness limitations.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — primary schedule and access-fallback policy.
