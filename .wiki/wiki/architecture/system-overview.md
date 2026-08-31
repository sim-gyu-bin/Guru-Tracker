---
title: System Overview
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# System Overview

## Decided facts

The planned stack is Next.js App Router on Vercel Hobby with Supabase PostgreSQL and Storage. The product is PWA-first. **Scheduled synchronization is primary; access synchronization is fallback.** Once per hour, Supabase Cron (`pg_cron` with `pg_net`) is planned to call a protected Next.js internal sync endpoint because Vercel Hobby Cron cannot run hourly. The scheduled and fallback access paths use the same idempotent coordinator under a database lease; see [hourly synchronization and Web Push](../decisions/hourly-sync-and-push.md).

On access, the UI first serves cached database data, then requests the shared coordinator only when data is stale or the scheduled job is behind. Runtime disclosure files belong in Supabase Storage, while PostgreSQL retains the current and immediately previous validated snapshots as defined in [database retention](database-retention.md). After actual changes commit, notification delivery is handled separately through the planned [Web Push outbox](../concepts/web-push-notifications.md).

## Deferred / open questions

The schema, source adapters, authentication, Storage layout, endpoint authorization details, and UI refresh mechanics are not yet designed.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained stack and snapshot decisions.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — superseding synchronization and push decision.
