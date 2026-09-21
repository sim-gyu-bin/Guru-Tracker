---
title: System Overview
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
decision_record:
  - project conversation, 2026-09-01
  - project conversation, 2026-09-18
  - project conversation, 2026-09-21
updated: 2026-09-21
---

# System Overview

## Decided facts

The planned stack is Next.js App Router on Vercel Hobby with Supabase PostgreSQL and Storage. The product is PWA-first. **Scheduled synchronization is primary; access synchronization is fallback.** Once per hour, Supabase Cron (`pg_cron` with `pg_net`) is planned to call a protected Next.js internal sync endpoint because Vercel Hobby Cron cannot run hourly. The scheduled and fallback access paths use the same idempotent coordinator under a database lease; see [hourly synchronization and Web Push](../decisions/hourly-sync-and-push.md).

On access, the UI first serves cached database data, then requests the shared coordinator only when data is stale or the scheduled job is behind. Runtime disclosure files belong in Supabase Storage, while PostgreSQL retains the current and immediately previous validated snapshots as defined in [database retention](database-retention.md). After actual changes commit, notification delivery is handled separately through the planned [Web Push outbox](../concepts/web-push-notifications.md).

User identity uses Supabase Auth with Google OAuth and owner approval: a first sign-in creates a `pending` request, and only an `approved` person reaches browsing pages. `/` renders no product copy and resolves by session and approval state — `approved` to `/main`, any other signed-in member to `/pending`, and an unauthenticated visitor to `/login`. `/privacy` and `/terms` are the public policy pages, `/pending` displays status, `/admin` requires the owner, and `/main` with `/main/gurus/...` requires approval. Sign-in and first sign-up share one Google OAuth start at `/auth/signin`, which preserves the internal `next` path; no credential form, separate sign-up screen, or separate sign-up API exists. Server, API, Proxy, and Row Level Security boundaries remain unchanged; see [Google OAuth access approval policy](../decisions/google-oauth-access.md).

The UI layer is Tailwind CSS utilities and shadcn/ui components over shared theme tokens. Project rules in `.omp/RULES.md` retire Linear's product UI as a fixed visual standard and require evaluating candidates against the service's information hierarchy and Korean readability. The locally installed official upstream `ui-ux-pro-max` skill provides general design, accessibility, responsive, and chart guidance; the service-specific criteria belong to project rules, not the upstream skill. See [technology stack](../decisions/technology-stack.md).

Shared appearance uses a root-class ThemeProvider with system-derived initial appearance and persisted light/dark overrides. The header toggles the resolved light/dark mode without exposing a separate system choice. The [fintech theme audit](../decisions/fintech-theme.md) records the measured reference palette, subsequent navigation decisions, and home-body accents.

## Deferred / open questions

The schema, source adapters, Storage layout, endpoint authorization details, and UI refresh mechanics are not yet designed. The access approval policy is decided; the Google Cloud OAuth client, Supabase Google provider, provider email credentials, remote migration application, and production verification are not complete. Repository implementation status is tracked in the project README and is not asserted on this page. The 2026-09-21 entry routing and sign-in surface are implemented locally and verified for the anonymous root redirect, the state-to-route mapping, and the login surface's `/auth/signin` entry with `next` preservation (desktop and mobile Chromium, with the actual OAuth navigation blocked in the probe); a real account OAuth sign-in remains unverified.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained stack and snapshot decisions.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — superseding synchronization and push decision.
- Project conversation on 2026-09-01 — authentication admission and deferred allowlist decision, superseded on 2026-09-18; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — approval-gated access, route map, and owner administration decision; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation and repository implementation on 2026-09-21 — public introduction and policy pages, later superseded the same day for the introduction part; no immutable raw capture was created.
- Project conversation and repository implementation on 2026-09-21 — removal of the public introduction, state-based root routing, the single `/auth/signin` GET for sign-in and first sign-up, and the retired fixed design reference; no immutable raw capture was created.
- Repository `.omp/skills/ui-ux-pro-max/SKILL.md` — official upstream UI design, accessibility, responsive, and chart guidance.
- Repository `.omp/AGENTS.md` and `.omp/RULES.md` — upstream preservation and project-specific UI constraints.
