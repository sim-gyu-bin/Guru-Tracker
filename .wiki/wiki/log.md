---
title: Guru Tracker Wiki Change Log
status: append-only
source_capture:
  - ../raw/sessions/2026-08-31-project-brainstorm.md
  - ../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
  - ../raw/sessions/2026-08-31-project-yolo-mode.md
  - ../raw/sessions/2026-08-31-code-comment-policy.md
decision_record:
  - project conversation, 2026-09-01
updated: 2026-09-01
---

# Guru Tracker Wiki Change Log

Append new entries at the end. Do not rewrite, delete, or reorder prior entries.

## Decided facts

The initial Wiki records planning decisions and known limitations only. It does not claim source retrieval or product implementation.

## Deferred / open questions

New entries will identify the evidence capture and pages affected when future decisions or corrections occur.

## Entries

### 2026-08-31 — Initial project knowledge capture

Created the [Wiki guidance](../AGENTS.md), Korean [structured session capture](../raw/sessions/2026-08-31-project-brainstorm.md), and indexed English synthesis: [product direction](product/product-direction.md), [system overview](architecture/system-overview.md), [lazy synchronization](architecture/lazy-synchronization.md), [database retention](architecture/database-retention.md), [tracked people](decisions/tracked-people.md), [technology stack](decisions/technology-stack.md), [synchronization decision (later superseded)](decisions/hourly-sync-and-push.md), [two-snapshot retention](decisions/two-snapshot-retention.md), [language policy](decisions/language-policy.md), [position diff](concepts/position-diff.md), [data freshness](concepts/data-freshness.md), [source provenance](concepts/source-provenance.md), and [data limitations](operations/data-limitations.md).

## Sources

- [Project brainstorm capture](../raw/sessions/2026-08-31-project-brainstorm.md)
- [Hourly sync and push update](../raw/sessions/2026-08-31-hourly-sync-and-push-update.md)
- [Project YOLO mode capture](../raw/sessions/2026-08-31-project-yolo-mode.md)
- [Code comment policy capture](../raw/sessions/2026-08-31-code-comment-policy.md)

### 2026-08-31 — Hourly synchronization and Web Push correction

Added the Korean [structured correction capture](../raw/sessions/2026-08-31-hourly-sync-and-push-update.md), replaced the obsolete no-cron synthesis with [hourly synchronization and Web Push](decisions/hourly-sync-and-push.md), added [Web Push notifications](concepts/web-push-notifications.md), and updated the affected architecture, product, freshness, limitation, technology, and index pages. Scheduled synchronization is now primary and access synchronization is fallback; this remains planning evidence, not implementation.

### 2026-08-31 — Project-local OMP YOLO mode

Added the Korean [configuration decision capture](../raw/sessions/2026-08-31-project-yolo-mode.md) and [project-local OMP YOLO mode](decisions/project-yolo-mode.md). Guru Tracker now explicitly auto-approves ordinary OMP tool tiers through `.omp/config.yml`, overrides inherited per-tool prompts, and denies selected destructive shell patterns without changing global or other-project settings.

### 2026-08-31 — Code comment policy

Added the Korean [coding convention capture](../raw/sessions/2026-08-31-code-comment-policy.md) and [code comment policy](decisions/code-comment-policy.md). Core and externally meaningful code now requires maintained Korean comments explaining intent, invariants, failure conditions, and source semantics without redundant line-by-line narration.

### 2026-09-01 — Google OAuth access policy

Added the [Google OAuth access policy](decisions/google-oauth-access.md) and indexed the decision. Guru Tracker will initially admit every Google-authenticated account without email/password, Magic Link, approval email, or custom SMTP flows. URL distribution is explicitly not treated as access control; ordinary members remain constrained by Proxy checks, Row Level Security, user ownership, and server-only mutation boundaries. A later database email allowlist will keep Google OAuth while combining a Before User Created Hook for new identities with Proxy and RLS checks for existing users. No raw capture was added because `.wiki/raw` is human-owned.
