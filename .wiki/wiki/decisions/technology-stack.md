---
title: Technology Stack
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
  - ../../raw/sessions/2026-08-31-project-yolo-mode.md
updated: 2026-08-31
---

# Technology Stack

## Decided facts

The planned stack is Next.js App Router, Vercel Hobby, and Supabase PostgreSQL plus Storage. The product is PWA-first. Supabase Storage is the planned home for runtime disclosure files; it is not a substitute for the database snapshot model described in [database retention](../architecture/database-retention.md).

Supabase Cron (`pg_cron` with `pg_net`) is planned to call a protected Next.js internal sync endpoint hourly because Vercel Hobby Cron cannot run hourly. Its secret belongs in Supabase Vault and server-only configuration. The planned notification transport is standards-based Web Push with a service worker and VAPID; a Supabase Edge Function is not required unless later implementation evidence warrants one. The stack supports the primary scheduled and fallback access [system overview](../architecture/system-overview.md); it does not imply that any component is implemented.

OMP is configured with a repository-local explicit YOLO approval policy. It auto-approves ordinary tool tiers for this project while denying selected destructive shell patterns; see [project-local OMP YOLO mode](project-yolo-mode.md).

## Deferred / open questions

Versions, schema, authentication, deployment configuration, storage paths, endpoint authorization details, observability, and PWA implementation details are undecided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained planned stack.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — scheduling, secret placement, and push transport decision.
- [Project YOLO mode capture](../../raw/sessions/2026-08-31-project-yolo-mode.md) — repository-local OMP approval policy.
