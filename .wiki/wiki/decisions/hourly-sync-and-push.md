---
title: Hourly Synchronization and Web Push
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# Hourly Synchronization and Web Push

## Decided facts

This decision supersedes the prior no-cron approach. **Scheduled synchronization is primary; access synchronization is fallback.** Supabase Cron (`pg_cron` with `pg_net`) will invoke a protected Next.js internal sync endpoint once per hour because Vercel Hobby Cron cannot run hourly. The endpoint secret belongs in Supabase Vault and server-only configuration. A Supabase Edge Function is not required unless later implementation evidence warrants one.

Both triggers call the same idempotent sync coordinator under a database lease. Access first shows cached database data and requests a sync only when data is stale or the scheduled job is behind. The coordinator preserves the existing rule to fetch only changed documents, validate candidates, atomically rotate the two snapshots, and advance the dataset version only for an actual change; see [lazy synchronization](../architecture/lazy-synchronization.md) and [database retention](../architecture/database-retention.md).

After a validated database transaction creates actual change events, it records notification work in an outbox for standards-based Web Push. The outbox uses unique event/document keys to prevent duplicate delivery. Push happens after commit, and a push failure does not roll back source data. Delivered outbox rows and event history will be pruned after a short retention window. See [Web Push notifications](../concepts/web-push-notifications.md).

## Deferred / open questions

Staleness thresholds, lease behavior, endpoint authorization details, retry policy, notification types and recipient preferences, and the exact short retention duration are not decided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — superseded no-cron decision and retained snapshot rules.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — superseding schedule and push decision.
