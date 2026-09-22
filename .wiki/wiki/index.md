---
title: Guru Tracker Wiki Index
status: active
source_capture:
  - ../raw/sessions/2026-08-31-project-brainstorm.md
  - ../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
  - ../raw/sessions/2026-08-31-project-yolo-mode.md
  - ../raw/sessions/2026-08-31-code-comment-policy.md
decision_record:
  - project conversation, 2026-09-01
  - project conversation, 2026-09-18
  - project conversation, 2026-09-21
  - project conversation, 2026-09-22
updated: 2026-09-22
---

# Guru Tracker Wiki Index

## Decided facts

This index locates the LLM-owned English synthesis, its immutable Korean evidence captures, and governance. The [project brainstorm capture](../raw/sessions/2026-08-31-project-brainstorm.md) supplies the initial product decisions; the [hourly sync and push update](../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) supersedes its no-cron decision; the [project YOLO mode capture](../raw/sessions/2026-08-31-project-yolo-mode.md) records a superseded repository-local approval decision. Current OMP settings are inherited from the global profile without a project config. No official source sample has been captured.

Authentication is decided at the policy level and is now approval-gated: Supabase Auth with Google OAuth is the only sign-in method, a first sign-in creates a `pending` request, and only one owner bound to a verified Google identity and database user id may approve or refuse it. The 2026-09-01 open-admission decision and its deferred email allowlist are revoked; see [Google OAuth access approval policy](decisions/google-oauth-access.md).

The 2026-09-21 public-page decision added an unauthenticated introduction at `/`, privacy policy at `/privacy`, and terms at `/terms`; the introduction part is superseded on the same day. `/` now renders no product copy and routes by session and approval state — `approved` to `/main`, any other signed-in member to `/pending`, unauthenticated to `/login` — and `/privacy` and `/terms` remain the public policy pages. Sign-in and first sign-up share the single Google OAuth start at `/auth/signin`, which preserves `next`; no separate sign-up screen or API is added. Browsing and administration remain approval-gated; see [system overview](architecture/system-overview.md) and [Google OAuth access approval policy](decisions/google-oauth-access.md).

The same 2026-09-21 direction retires a fixed external design reference: reproducing Linear's product UI is no longer the visual standard, while the shared theme tokens, Tailwind CSS utilities, and shadcn/ui components are retained and design decisions follow the project-local `ui-ux-pro-max` skill; see [technology stack](decisions/technology-stack.md). The root routing and sign-in surface are implemented locally and verified for the anonymous root redirect, the state-to-route mapping, and the login surface's `GET /auth/signin` entry with `next` preservation (desktop and mobile Chromium, with the actual OAuth navigation blocked in the probe); a real account OAuth sign-in remains unverified. Google brand verification and production publication remain separate, unverified operations.

The tracked set now has eight people. On 2026-09-22 Leopold Aschenbrenner, whose 13F is filed by Situational Awareness LP, was added as the eighth and the sixth SEC 13F-backed manager; the set, sources, and remaining open questions stay in [tracked people](decisions/tracked-people.md) and [source provenance](concepts/source-provenance.md).

The locally installed `ui-ux-pro-max` preserves official upstream content and its original English, with only OMP execution-path adaptation. Project-specific UI constraints live separately in `.omp/RULES.md`; they must not be attributed to or inserted into upstream guidance. See `.omp/AGENTS.md` for the preservation policy.

The 2026-09-22 approved cleanup removes the unused Space Grotesk asset and license while retaining active Pretendard assets; see the [theme decision](decisions/fintech-theme.md). Unused dropdown and Stanley refresh modules and two uncalled server helpers were also removed; no dependency or routing-policy change was made.

## Pages

### Governance and evidence

- [Wiki guidance](../AGENTS.md) — three-layer ownership, traceability, and correction rules.
- [Project brainstorm capture](../raw/sessions/2026-08-31-project-brainstorm.md) — Korean structured, non-verbatim source evidence.
- [Hourly sync and push update](../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — Korean structured, non-verbatim correction capture.
- [Project YOLO mode capture](../raw/sessions/2026-08-31-project-yolo-mode.md) — Korean structured, non-verbatim configuration decision.
- [Code comment policy capture](../raw/sessions/2026-08-31-code-comment-policy.md) — Korean structured, non-verbatim coding convention.

### Product

- [Product direction](product/product-direction.md)

### Architecture

- [System overview](architecture/system-overview.md)
- [Lazy synchronization](architecture/lazy-synchronization.md)
- [Database retention](architecture/database-retention.md)

### Decisions

- [Tracked people](decisions/tracked-people.md)
- [Technology stack](decisions/technology-stack.md)
- [Fintech theme audit and appearance](decisions/fintech-theme.md) — reference measurements, Pretendard typography, mobile navigation, light/dark switching, and home-body color hierarchy.
- [Hourly synchronization and Web Push](decisions/hourly-sync-and-push.md)
- [Two-snapshot retention](decisions/two-snapshot-retention.md)
- [Language policy](decisions/language-policy.md)
- [Project-local OMP YOLO mode](decisions/project-yolo-mode.md) — superseded override; current global-settings inheritance.
- [Code comment policy](decisions/code-comment-policy.md)
- [Google OAuth access approval policy](decisions/google-oauth-access.md)

### Concepts

- [Position diff](concepts/position-diff.md)
- [Data freshness](concepts/data-freshness.md)
- [Web Push notifications](concepts/web-push-notifications.md)
- [Source provenance](concepts/source-provenance.md)

### Operations and history

- [Data limitations](operations/data-limitations.md)
- [Wiki change log](log.md) — append-only history.
- This index (`index.md`) — page locator.

## Deferred / open questions

Future evidence captures, additional pages, and their index categories must be added only when evidence or a confirmed decision warrants them.

## Sources

- [Project brainstorm capture](../raw/sessions/2026-08-31-project-brainstorm.md) — initial and retained decisions.
- [Hourly sync and push update](../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — superseding synchronization and push decision.
- [Project YOLO mode capture](../raw/sessions/2026-08-31-project-yolo-mode.md) — superseded project-local OMP approval decision.
- [Code comment policy capture](../raw/sessions/2026-08-31-code-comment-policy.md) — Korean comment convention.
- Project conversation on 2026-09-01 — Google OAuth admission and deferred allowlist decision, superseded on 2026-09-18; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — approval-gated access decision; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-21 — public introduction and policy pages, later superseded the same day for the introduction part; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation and repository implementation on 2026-09-21 — removal of the public introduction, state-based root routing, the shared `/auth/signin` entry for sign-in and first sign-up, and the retired fixed design reference; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation and repository implementation on 2026-09-22 — the eighth tracked target (Leopold Aschenbrenner, SEC 13F) added to the home, desktop and mobile navigation, and detail route on the shared SEC 13F coordinator; no raw capture was added because `.wiki/raw` is human-owned.
- Repository `.omp/skills/ui-ux-pro-max/SKILL.md` — official upstream UI guidance installed locally.
- Repository `.omp/AGENTS.md` and `.omp/RULES.md`, and project conversation on 2026-09-21 — current approval-policy documentation and separation of upstream guidance from project-specific rules.
