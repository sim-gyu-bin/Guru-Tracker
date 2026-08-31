---
title: Database Retention
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# Database Retention

## Decided facts

The system retains exactly two dataset snapshots: the current validated snapshot and its immediately previous predecessor. Rotation is atomic and occurs only after a new source validates. A failed or unvalidated fetch must not replace the current snapshot. Dataset versioning advances only when source content actually changes.

When a validated database transaction creates actual change events, it records corresponding Web Push work in an outbox only after commit. Unique event/document keys prevent duplicate work. Delivery failure does not roll back source data, and delivered outbox rows plus event history will be pruned after a short, not-yet-defined retention window. This retention policy supports [position diffs](../concepts/position-diff.md), the [shared synchronization flow](lazy-synchronization.md), and [Web Push notifications](../concepts/web-push-notifications.md).

## Deferred / open questions

Database tables, transaction boundaries, validation criteria, hashes, the definition of an actual change, and the exact notification-history retention duration remain undecided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained two-snapshot and versioning rules.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — post-commit outbox and pruning decision.
