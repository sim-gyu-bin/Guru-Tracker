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
updated: 2026-09-21
---

# Guru Tracker Wiki Index

## Decided facts

This index locates the LLM-owned English synthesis, its immutable Korean evidence captures, and governance. The [project brainstorm capture](../raw/sessions/2026-08-31-project-brainstorm.md) supplies the initial product decisions; the [hourly sync and push update](../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) supersedes its no-cron decision; the [project YOLO mode capture](../raw/sessions/2026-08-31-project-yolo-mode.md) records the repository-local OMP approval policy. No official source sample has been captured.

Authentication is decided at the policy level and is now approval-gated: Supabase Auth with Google OAuth is the only sign-in method, a first sign-in creates a `pending` request, and only one owner bound to a verified Google identity and database user id may approve or refuse it. The 2026-09-01 open-admission decision and its deferred email allowlist are revoked; see [Google OAuth access approval policy](decisions/google-oauth-access.md).

The 2026-09-21 public-page decision adds an unauthenticated introduction at `/`, privacy policy at `/privacy`, and terms at `/terms`. Browsing and administration remain approval-gated; see [system overview](architecture/system-overview.md). Google brand verification and production publication remain separate, unverified operations.

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
- [Hourly synchronization and Web Push](decisions/hourly-sync-and-push.md)
- [Two-snapshot retention](decisions/two-snapshot-retention.md)
- [Language policy](decisions/language-policy.md)
- [Project-local OMP YOLO mode](decisions/project-yolo-mode.md)
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
- [Project YOLO mode capture](../raw/sessions/2026-08-31-project-yolo-mode.md) — project-local OMP approval decision.
- [Code comment policy capture](../raw/sessions/2026-08-31-code-comment-policy.md) — Korean comment convention.
- Project conversation on 2026-09-01 — Google OAuth admission and deferred allowlist decision, superseded on 2026-09-18; no raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — approval-gated access decision; no raw capture was added because `.wiki/raw` is human-owned.
