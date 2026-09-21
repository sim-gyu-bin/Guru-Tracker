---
title: System Overview
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
decision_record:
  - project conversation, 2026-09-01
  - project conversation, 2026-09-18
updated: 2026-09-21
---

# System Overview

## Decided facts

The planned stack is Next.js App Router on Vercel Hobby with Supabase PostgreSQL and Storage. The product is PWA-first. **Scheduled synchronization is primary; access synchronization is fallback.** Once per hour, Supabase Cron (`pg_cron` with `pg_net`) is planned to call a protected Next.js internal sync endpoint because Vercel Hobby Cron cannot run hourly. The scheduled and fallback access paths use the same idempotent coordinator under a database lease; see [hourly synchronization and Web Push](../decisions/hourly-sync-and-push.md).

On access, the UI first serves cached database data, then requests the shared coordinator only when data is stale or the scheduled job is behind. Runtime disclosure files belong in Supabase Storage, while PostgreSQL retains the current and immediately previous validated snapshots as defined in [database retention](database-retention.md). After actual changes commit, notification delivery is handled separately through the planned [Web Push outbox](../concepts/web-push-notifications.md).

User identity uses Supabase Auth with Google OAuth and owner approval: a first sign-in creates a `pending` request, and only an `approved` person reaches browsing pages. Since the 2026-09-21 decision, `/`, `/privacy`, and `/terms` are public information pages regardless of access state. `/login` enters the existing approval flow, `/pending` displays status, `/admin` requires the owner, and `/main` with `/main/gurus/...` requires approval. Server, API, Proxy, and Row Level Security boundaries remain unchanged; see [Google OAuth access approval policy](../decisions/google-oauth-access.md). Public page implementation does not establish Google brand verification or production deployment.

## Deferred / open questions

The schema, source adapters, Storage layout, endpoint authorization details, and UI refresh mechanics are not yet designed. The access approval policy is decided; the Google Cloud OAuth client, Supabase Google provider, provider email credentials, remote migration application, and production verification are not complete. Repository implementation status is tracked in the project README and is not asserted on this page.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained stack and snapshot decisions.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — superseding synchronization and push decision.
- Project conversation on 2026-09-01 — authentication admission and deferred allowlist decision, superseded on 2026-09-18; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — approval-gated access, route map, and owner administration decision; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation and repository implementation on 2026-09-21 — public introduction and policy pages; no immutable raw capture was created.
