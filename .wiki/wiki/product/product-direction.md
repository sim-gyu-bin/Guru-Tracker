---
title: Product Direction
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
decision_record:
  - project conversation, 2026-09-01
  - project conversation, 2026-09-18
updated: 2026-09-18
---

# Product Direction

## Decided facts

Guru Tracker is a private product for family and acquaintances. It follows seven public figures and makes their disclosed positions or transactions comparable with source context: [tracked people](../decisions/tracked-people.md). The product is PWA-first. **Scheduled synchronization is primary; access synchronization is fallback:** access displays cached data first and requests the shared sync only when data is stale or the scheduled job is behind; see [system overview](../architecture/system-overview.md).

The planned PWA may offer opt-in change notifications through [Web Push](../concepts/web-push-notifications.md). The project must describe planned behavior honestly until implementation and source samples exist.

Initial access uses Google OAuth with owner approval: a first sign-in records a `pending` request, and only the single owner may approve it, reject it, or later revoke an approved person. Sharing the deployment URL only with family and acquaintances is a distribution choice, not a security boundary, so access is decided by the recorded approval state rather than by knowledge of the URL; see [Google OAuth access approval policy](../decisions/google-oauth-access.md).

## Deferred / open questions

Final screens, offline behavior, notification preferences, and measurable UI acceptance criteria are not decided. The access approval policy is decided; the Google Cloud OAuth client, Supabase Google provider, provider email credentials, remote migration application, and production verification are not complete.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained product scope and PWA-first direction.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — scheduled refresh and planned opt-in notifications.
- Project conversation on 2026-09-01 — Google OAuth admission and deferred allowlist decision, superseded on 2026-09-18; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — owner-approval access decision; no raw capture was added because `.wiki/raw` is human-owned.
