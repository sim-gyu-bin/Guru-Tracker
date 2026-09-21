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
  - project conversation, 2026-09-18
  - project conversation, 2026-09-21
updated: 2026-09-21
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

### 2026-09-18 — Google OAuth access approval policy

Superseded the admission policy of the [Google OAuth access policy](decisions/google-oauth-access.md) page, which now records the approval-gated decision. Open self-admission and the deferred email allowlist are revoked. Supabase Auth with Google OAuth stays the only sign-in method, but a first sign-in creates a `pending` access request; only `approved` records reach the application, and `rejected` or `revoked` people are blocked on the next server or API request instead of obtaining a new request by signing in again. One owner, bound to a verified Google identity and a database user id and identified initially by the server-only `ADMIN_EMAIL` value, accepts, rejects, revokes, and re-approves from `/admin` using the same database state. A new request notifies the owner by email with accept and reject links that only open the `/admin` screen for that request; the decision is applied by POST after the owner's Google administrator sign-in, so an emailed GET has no side effect, and a failed notification leaves the request pending. Access routes are `/` (state-based), `/login`, `/pending`, `/admin`, `/main`, and `/main/gurus/...`; ordinary authorization stays with the server, API routes, and Row Level Security, while the internal cron endpoints keep their separate bearer authorization. The initial mail provider candidate Resend is recorded as an implementation choice, not a product decision. Updated the affected index, product direction, system overview, and technology stack pages. Google Cloud, Supabase, and provider email configuration are not complete, so this entry records a confirmed plan rather than implemented behavior. No raw capture was added because `.wiki/raw` is human-owned.

### 2026-09-18 — Access approval local verification scope

Recorded the verified local scope for the approval contract, leaving remote verification explicitly open. On the local release build, the access guard sweeps passed 50/50 (implementer probe) and 66/66 (independent verifier sweep). A real Chromium run against a stub Supabase service and PGlite carrying the actual `202609180001_access_approval.sql` migration executed every state transition (accept, reject, revoke, re-approve) with exactly one `revision` increment each, showed a repeated decision form returning `stale` on the second POST, showed the emailed decision link's GET leaving state unchanged while only the POST after the owner's sign-in applies it, showed re-sign-in not re-opening a request for `rejected` or `revoked` records, and confirmed the route contract (`/main` and `/main/gurus/...` for approved people, `/pending` otherwise, legacy `/gurus/...` gone). Screens were rendered at desktop 1280x900 and mobile 390x844, including `/login`, `/admin`, `/pending`, `/main`, and the person detail page. This evidence covers the local stub harness and a locally built artifact only: a real Google session, the remote Supabase project (including Row Level Security and Auth hook behavior), and provider email delivery remain unverified, and `APP_URL`, `ADMIN_EMAIL`, `RESEND_API_KEY`, and `RESEND_FROM` are still unset while the Supabase URL, public key, secret key, and `SYNC_SECRET` are already configured. Affected pages: this log and the README access policy section. No raw capture was added because `.wiki/raw` is human-owned.

### 2026-09-21 — Public introduction and policy pages

The project conversation requested public information pages for a family-only service. Implemented `/`, `/privacy`, and `/terms` without exposing member or disclosure data, and added links from sign-in. Updated the system overview, access decision, and index. Local Chromium confirmed public policy responses and anonymous redirects from `/main` and `/admin` to `/login`; the access regression file passed 10 tests and type/lint checks passed. No production deployment or Google brand approval was performed. No human-owned raw evidence was modified.

### 2026-09-21 — Root introduction removed; state-based entry routing and UI direction

Superseded the introduction part of the earlier same-day entry above, which stays unchanged. `/` no longer renders product copy and only resolves by session and approval state: `approved` to `/main`, any other signed-in member to `/pending`, and an unauthenticated visitor to `/login`. `/privacy` and `/terms` remain the public pages, and the policy links stay on the sign-in surface.

Sign-in and first sign-up share the single Google OAuth start at `/auth/signin`, which preserves the validated internal `next` path. No credential form, separate sign-up screen, or separate sign-up API was added; the first sign-in is what creates the `pending` request.

The UI direction also retires the practice of reproducing Linear's product interface as the fixed visual standard. Shared theme tokens, Tailwind CSS utilities, and shadcn/ui components are retained, and design, accessibility, responsive, and chart decisions follow the project-local `ui-ux-pro-max` skill.

Updated the [system overview](architecture/system-overview.md), [product direction](product/product-direction.md), [technology stack](decisions/technology-stack.md), [Google OAuth access approval policy](decisions/google-oauth-access.md), and [the index](index.md). Verified locally: an anonymous browser request to `/` on localhost redirected to `/login`, and the root resolver mapped anonymous, unverified, and unresolved (`error`, `absent`, `unconfigured`) states to `/login`, `approved` to `/main`, and `pending`, `rejected`, and `revoked` to `/pending`. A real Chromium run at 1440x1000 and 390x844 rendered the login surface with no horizontal overflow on the mobile viewport, and submitting each of its two entry buttons issued `GET /auth/signin` with `next` preserved while the actual OAuth navigation was blocked in the probe. `pnpm lint` passed and the access-approval and auth-signout test files passed 16 tests. A real account OAuth sign-in through the login surface remains unverified, and no production deployment or Google brand approval was performed. No human-owned raw evidence was modified.

## 2026-09-21 — Fintech reference audit and system-only theme

Audited the [fintech demo](https://uupm.cc/demo/fintech-crypto) through source CSS, desktop/mobile computed styles, hover states, and reduced-motion/system-color emulation. Wrote [the theme decision](decisions/fintech-theme.md) before implementation, separating observed dark values from derived light choices and deferred layout work. Applied shared palette/glass/button tokens and CSS media-based appearance, including chart style generation; removed the manually selectable theme and its approved obsolete files/dependency. Updated the index, technology stack, architecture, and product direction links. Verified desktop/mobile login, preserved-but-ignored stored theme, JavaScript-disabled dark rendering, hover/reduced motion, mobile privacy, real chart-style server output, and `pnpm lint` (91 files). No raw evidence files, authentication behavior, production deployment, or full login layout redesign were changed.

### 2026-09-21 — Approval-policy and upstream-skill documentation correction

Following the project conversation, corrected the [historical YOLO decision](decisions/project-yolo-mode.md), [technology stack](decisions/technology-stack.md), [system overview](architecture/system-overview.md), and [index](index.md). The project inherits global OMP settings without `.omp/config.yml`; the earlier local override is superseded, not a current instruction. The original capture and earlier log entries remain unchanged.

Separated project-specific UI constraints in `.omp/RULES.md` from the official upstream `ui-ux-pro-max` guidance. `.omp/AGENTS.md` now explicitly preserves upstream content and its original English, allowing only minimal OMP execution-path adaptation. Updated README's stale Linear-based descriptions. No upstream skill files, human-owned raw evidence, application code, or approval configuration were changed.

### 2026-09-21 — Representative disclosure layouts

Implemented the home and Stanley detail layouts only, using official upstream design guidance as candidates rather than a fixed template. Retained shared theme tokens, system-only appearance, fonts, dependencies, authentication, and data/synchronization contracts. Home now separates connected and unconnected destinations; Stanley prioritizes disclosure dates and adds official filing/information-table links.

Updated README and the [design decision](decisions/fintech-theme.md). Actual page components were visually exercised with synthetic fixtures in an isolated in-memory Chromium harness: four viewport widths without horizontal overflow, desktop/mobile light and dark, mobile empty/error/unconfigured states, and home-card keyboard focus and navigation. `pnpm lint` passed for 91 files. Real-account, DB, and synchronization integration were not exercised. Expansion to other screens awaits user review; upstream skill files and human-owned raw evidence were unchanged.

### 2026-09-21 — Pretendard project typography

The user chose Pretendard for the whole project and approved larger representative-screen typography with matching layout adjustments. Removed Space Grotesk loading, retained its existing asset/license files, and unified numeric display fonts while preserving tabular figures. Updated the home, Stanley detail, and shared allocation-chart typography; other detail layouts were not redesigned. No data, authentication, or synchronization semantics changed.

### 2026-09-21 — Approved mobile navigation and theme choices

After user approval of the shadcn directory reference direction, added a full-height mobile navigation sheet and light/dark/system selection with system as default. Retained Pretendard and the existing palette; aligned connected-page titles to 30px/600 and section headings to 20px/600. Updated README and the [design decision](decisions/fintech-theme.md), marking the earlier system-only contract as historical. TypeScript and Biome passed for 96 files. Chromium exercised responsive components, menu focus/navigation, persistence, OS following, and actual Next.js pre-hydration appearance with invalid/blocked storage fallback. Synthetic disclosure fixtures do not establish authenticated data integration. No raw evidence or upstream skill files changed.

### 2026-09-21 — Binary theme control and home-body accents

Recorded the user-approved neutral light/dark toggle, retained green header actions, and added blue/green emphasis to the home introduction, connected cards, source badges, and count. Unavailable cards remain neutral; data semantics are unchanged. Updated the current architecture, stack, index, and [theme decision](decisions/fintech-theme.md) to supersede stale system-only descriptions. Actual components with synthetic data were visually checked at desktop/mobile widths in both themes, including keyboard focus and empty data; TypeScript and Biome passed for 96 files. No authenticated data integration was exercised.
