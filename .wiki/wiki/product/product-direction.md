---
title: Product Direction
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

# Product Direction

## Decided facts

Guru Tracker is a private product for family and acquaintances. It follows seven public figures and makes their disclosed positions or transactions comparable with source context: [tracked people](../decisions/tracked-people.md). The product is PWA-first. **Scheduled synchronization is primary; access synchronization is fallback:** access displays cached data first and requests the shared sync only when data is stale or the scheduled job is behind; see [system overview](../architecture/system-overview.md).

The planned PWA may offer opt-in change notifications through [Web Push](../concepts/web-push-notifications.md). The project must describe planned behavior honestly until implementation and source samples exist.

Initial access uses Google OAuth with owner approval: a first sign-in records a `pending` request, and only the single owner may approve it, reject it, or later revoke an approved person. Sharing the deployment URL only with family and acquaintances is a distribution choice, not a security boundary, so access is decided by the recorded approval state rather than by knowledge of the URL; see [Google OAuth access approval policy](../decisions/google-oauth-access.md).

The product has no public introduction. `/` renders no product copy and only routes by session and approval state, and the public policy pages are the privacy policy and terms. Sign-in and first sign-up share one Google OAuth entry, and the first sign-in is what records the `pending` request, so there is no separate registration step to design.

Visual direction is not pinned to any single product's interface. Screens reuse the shared design tokens with Tailwind CSS utilities and shadcn/ui components, and design, accessibility, responsive, and chart decisions follow the project-local `ui-ux-pro-max` skill instead of reproducing a fixed external reference; see [technology stack](../decisions/technology-stack.md).

The current bounded [fintech theme decision](../decisions/fintech-theme.md) adopts measured color and interaction primitives, not the reference's cryptocurrency content or landing-page layout. Light and dark appearance follow the system only; a login layout redesign is outside this change.

## Deferred / open questions

Final screens, offline behavior, notification preferences, and measurable UI acceptance criteria are not decided. The access approval policy is decided; the Google Cloud OAuth client, Supabase Google provider, provider email credentials, remote migration application, and production verification are not complete.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained product scope and PWA-first direction.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — scheduled refresh and planned opt-in notifications.
- Project conversation on 2026-09-01 — Google OAuth admission and deferred allowlist decision, superseded on 2026-09-18; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — owner-approval access decision; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation and repository implementation on 2026-09-21 — removal of the public introduction, state-based root routing, the shared Google OAuth entry for sign-in and first sign-up, and the retired fixed design reference. Verified locally for the anonymous root redirect, the state-to-route mapping, and the login surface's `/auth/signin` entry with `next` preservation; a real account OAuth sign-in remains unverified. No raw capture was added because `.wiki/raw` is human-owned.
