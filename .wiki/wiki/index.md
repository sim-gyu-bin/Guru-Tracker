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
updated: 2026-09-01
---

# Guru Tracker Wiki Index

## Decided facts

This index locates the LLM-owned English synthesis, its immutable Korean evidence captures, and governance. The [project brainstorm capture](../raw/sessions/2026-08-31-project-brainstorm.md) supplies the initial product decisions; the [hourly sync and push update](../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) supersedes its no-cron decision; the [project YOLO mode capture](../raw/sessions/2026-08-31-project-yolo-mode.md) records the repository-local OMP approval policy. No official source sample has been captured.

Authentication is now decided at the policy level: Google OAuth admits every Google-authenticated user initially, while RLS and server-only boundaries prevent member privilege escalation. A database email allowlist with a pre-creation hook and ongoing membership checks is the deferred hardening path; see [Google OAuth access policy](decisions/google-oauth-access.md).

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
- [Google OAuth access policy](decisions/google-oauth-access.md)

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
- Project conversation on 2026-09-01 — Google OAuth admission and deferred allowlist decision; no raw capture was added because `.wiki/raw` is human-owned.
