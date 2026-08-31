---
title: Two-Snapshot Retention
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# Two-Snapshot Retention

## Decided facts

Only the current validated snapshot and the immediately previous snapshot are retained. Replacement is atomic after validation, never before it. Dataset versions advance only for actual changes. This is the governing decision for [database retention](../architecture/database-retention.md) and enables a bounded [position diff](../concepts/position-diff.md). It is distinct from the short-lived delivered outbox and event-history retention planned for [Web Push notifications](../concepts/web-push-notifications.md).

## Deferred / open questions

The snapshot payload, validation rules, change fingerprint, transaction implementation, restoration procedure, and exact notification-history retention duration are undecided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — governing snapshot retention decision.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — retained snapshot policy and separate notification-history retention.
