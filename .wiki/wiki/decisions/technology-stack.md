---
title: Technology Stack
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
  - ../../raw/sessions/2026-08-31-project-yolo-mode.md
decision_record:
  - project conversation, 2026-09-01
  - project conversation, 2026-09-18
updated: 2026-09-18
---

# Technology Stack

## Decided facts

The planned stack is Next.js App Router, Vercel Hobby, and Supabase PostgreSQL plus Storage. The product is PWA-first. Supabase Storage is the planned home for runtime disclosure files; it is not a substitute for the database snapshot model described in [database retention](../architecture/database-retention.md).

Supabase Cron (`pg_cron` with `pg_net`) is planned to call a protected Next.js internal sync endpoint hourly because Vercel Hobby Cron cannot run hourly. Its secret belongs in Supabase Vault and server-only configuration. The planned notification transport is standards-based Web Push with a service worker and VAPID; a Supabase Edge Function is not required unless later implementation evidence warrants one. The stack supports the primary scheduled and fallback access [system overview](../architecture/system-overview.md); it does not imply that any component is implemented.

OMP is configured with a repository-local explicit YOLO approval policy. It auto-approves ordinary tool tiers for this project while denying selected destructive shell patterns; see [project-local OMP YOLO mode](project-yolo-mode.md).

Supabase Auth with Google OAuth is the decided sign-in stack, now gated by owner approval: a first sign-in creates a `pending` access request that only the single owner may approve, and `rejected` or `revoked` people are blocked instead of re-requesting automatically. Ordinary users are constrained by SSR session validation, server routes, APIs, and Row Level Security, while the internal cron endpoints keep their separate bearer authorization. Email/password and Magic Link sign-in remain excluded; see [Google OAuth access approval policy](google-oauth-access.md).

Owner approval notifications need transactional email through a provider API. Resend is the initial provider candidate and is recorded as an implementation choice, not a product decision: the provider can be replaced without changing the approval states, routes, or database contract.

## Deferred / open questions

Versions, schema details, deployment configuration, storage paths, endpoint authorization details, observability, and PWA implementation details remain undecided. The Google Cloud OAuth client, Supabase Google provider and redirect allowlist, provider email credentials, and remote migration application are not set up, and the server-only `ADMIN_EMAIL` value that identifies the initial owner is runtime configuration rather than repository content.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained planned stack.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — scheduling, secret placement, and push transport decision.
- [Project YOLO mode capture](../../raw/sessions/2026-08-31-project-yolo-mode.md) — repository-local OMP approval policy.
- Project conversation on 2026-09-01 — Google OAuth and deferred allowlist decision, superseded on 2026-09-18; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — approval-gated access decision and the separation of the Resend provider choice from the product decision; no raw capture was added because `.wiki/raw` is human-owned.
- [Resend documentation](https://resend.com/docs) — candidate transactional email provider for owner approval notifications.
