---
title: Enhancement Plan — 2026-09-22
status: item-one-implemented-and-verified
decision_record:
  - project conversation, 2026-09-22
observed: 2026-09-22
updated: 2026-09-22
---

# Enhancement Plan — 2026-09-22

## Confirmed scope

The owner requested a dated Wiki plan and approved **item 1 only** for implementation. Items 2–5 remain proposals, not implementation commitments. The owner subsequently requested a develop commit and push, a merge and push to main, and a return to develop after verification.

The eight tracked people and official-source boundaries are unchanged. SEC 13F disclosures are delayed reported positions, ARK holdings are official fund disclosures, and House PTR records are disclosed transactions rather than current holdings or portfolio weights. No additional data provider, source parser change, historical reconstruction, Web Push, or data deletion is approved by item 1.

## Observed baseline

Read-only repository and production database inspection on 2026-09-22 established the following before implementation:

- Five of eight target schedules were active: ARK, House PTR, Laffont, Gerstner, and Tepper. Stanley and Burry had no hourly job; Aschenbrenner had a registered but inactive job.
- All thirteen collection units (seven individual targets plus six ARK funds) had current snapshots and a successful check within the preceding hour; the stored last-error fields were empty. This describes successful checks, not real-time holdings or guaranteed future schedule execution.
- All six SEC targets and House PTR had no previous snapshot; ARK's six funds had previous snapshots.
- Detail lists render responsive tables/cards but do not offer in-list search, filtering, or sorting. The shared SEC previous-filing panel shows dates, row counts, and disclosed-value totals, not row-level differences.
- The repository contains no installation manifest, service-worker registration, Web Push subscription path, or delivery outbox. Existing committed change events are not push delivery.

The earlier README deployment notes are historical and are not used as current operational truth. No human-owned `.wiki/raw` evidence was created or modified.

## Prioritized plan

| Priority | Enhancement | Minimum scope | Decision |
| --- | --- | --- | --- |
| 1 | Complete unattended hourly synchronization for all eight people | Verify deployed protected endpoints; register Stanley and Burry, activate Aschenbrenner without changing the other schedules; expose target/fund success, delay, failure, and schedule state to the existing administrator page | Implemented and verified; see evidence below |
| 2 | Search, filter, and sort disclosure lists | SEC name/ticker/CUSIP and security-type controls; ARK within-fund search and official-weight ordering; PTR asset/type/date controls without numeric conversion of amount ranges | Deferred proposal |
| 3 | Explain what changed | Compare current and previous verified snapshots for additions, removals, and reported quantity/value changes; distinguish missing comparison data and never equate a disclosure difference with a trade or profit | Deferred proposal |
| 4 | Installable PWA | Application manifest/icons, installation guidance, standalone launch, and an honest offline screen; do not cache protected HTML/API responses indiscriminately | Deferred proposal |
| 5 | Verified-change Web Push | Explicit opt-in, subscription lifecycle, VAPID/service worker, transactional event/document-keyed outbox, retry and deduplication; delivery failures must not roll back disclosure data | Deferred proposal; depends on item 4 and server delivery contracts |

## Item 1 implementation boundaries

- **Scheduling:** Supabase `pg_cron` and `pg_net` only. Secrets remain in Vault and server-only configuration. Stanley is assigned minute 1; Burry keeps its prepared minute 19; Aschenbrenner keeps minute 43. Existing minutes 7/13/25/31/37 are preserved.
- **Synchronization:** Existing access fallback and protected internal endpoints continue to share the same coordinator, per-target/fund fenced lease, cooldown, validation, and atomic two-snapshot rotation. Viewing the status panel must not collect data or trigger a sync.
- **Database:** A server-only, read-only status projection may expose whitelisted state timestamps, snapshot availability/version, and Cron schedule/activity/count. It must never expose Vault values, Cron commands, HTTP headers, request queues, raw disclosure snapshots, or user identity data. Anonymous and authenticated client roles must not execute it.
- **Server/UI:** Reuse the existing administrator guard before reading operational state. Add a compact read-only section to `/admin`; preserve account approval behavior. Keep collection health separate from Cron activity: an active job alone does not prove successful collection. ARK remains six independently visible units.
- **Failure handling:** Show missing configuration or status-query failure without breaking account approval. Distinguish a valid running lease, a failed attempt, delayed success, and no initial snapshot. Text labels supplement semantic colors; desktop and mobile use existing Tailwind/shadcn tokens.
- **Non-goals:** No new public operations API, sync button, automatic recovery loop, retention cleanup, notification permission prompt, source parser changes, or item 2–5 implementation.

## Verification plan

1. Probe the three deployed endpoints without credentials and with the Vault-held synchronization credential; report only endpoint names, request identifiers, HTTP results, and safe result statuses.
2. Require successful `updated`/`unchanged` collection responses before registering or activating the missing schedules. Confirm all eight schedules and exercise the stored job commands without logging their contents.
3. Check unchanged document processing does not rotate snapshots, increment versions, or create duplicate change events. Record any genuine new disclosure separately rather than forcing an unchanged result.
4. Verify the status RPC's service-role-only execution and read-only data projection. Exercise health precedence and timestamps without collecting data.
5. Render the actual administrator component at desktop/mobile widths and both themes; check healthy, delayed, failed, running, missing/inactive schedule, and query-error states. Confirm the existing administrator gate and approval UI remain intact.
6. Run the relevant checks once after integration, update this page with observed results and limitations, then perform the requested branch delivery.

## Implementation and verification record

### Operational schedule and endpoint evidence

- Registered Stanley at `1 * * * *` and Burry at `19 * * * *`; activated the existing Aschenbrenner job at `43 * * * *`. The existing five jobs and their schedules were preserved. All eight target jobs are active.
- Unauthenticated probes for Stanley, Burry, and Aschenbrenner returned HTTP 401. Vault-authenticated probes returned HTTP 200 with `status: unchanged` (request identifiers 1123–1128 distinguish the six probes).
- Executed the saved Cron commands without printing commands or credentials. The seven non-ARK requests (1136–1142) returned HTTP 200 `unchanged`; a complete six-fund ARK invocation (1144–1149) also returned HTTP 200 `unchanged`. ARK's one job fans out into six independent requests; a single response is not treated as evidence for all funds.
- Stanley, Burry, and Aschenbrenner retained version 1, one event each, no previous snapshot, and unchanged document/normalized hashes after repeated unchanged processing. Source parsers and snapshot commit logic were not changed.
- These are actual production API and saved-command checks, not a claim that every future hourly run will succeed. Historical ARK 503 responses were not root-caused in this work.

### Administrator read model and UI

- Added `supabase/stanley-cron.sql`, the read-only `public.admin_sync_health()` function (`supabase/migrations/202609220003_sync_health.sql`), `src/domain/sync-health.ts`, `src/server/sync-health.ts`, and `src/components/admin-sync-health.tsx`; integrated the panel after the existing approval flow in `/admin`.
- Applied the status function to the production database after a local PGlite smoke. Fresh installations must enable `pg_cron` before applying this function. It returns thirteen expected units even when state rows are missing, preserves bigint versions as strings, and omits snapshot bodies, raw errors, Cron commands, Vault values, and user identities.
- The local SQL smoke executed the actual migration: the service role received thirteen sanitized rows, while both `anon` and `authenticated` execution attempts failed with SQLSTATE 42501. Production privilege inspection confirmed the same grants; a real anonymous PostgREST request returned HTTP 401.
- The actual server loader successfully queried the production RPC and returned thirteen healthy rows with active schedules. State health uses the database observation timestamp, not the browser clock. A valid lease, failed attempt, absent initial snapshot, and the exact one-hour delay boundary remain distinct from schedule registration/activity.
- The existing administrator guard remains before the operational read. Query/configuration failures render a separate status notice; the panel does not invoke a collector, modify schedules, add a public operations API, or alter approval decisions.

### Verification scope and limits

- `pnpm biome` passed TypeScript and Biome checks for 120 files. `pnpm test` passed **70/70**, including five new tests for health precedence, the one-hour boundary, independent Cron/fund state, malformed or future timestamps, and large version values.
- Chromium rendered the actual status component with real RPC-derived metadata and explicit alternate-state fixtures at 320, 375, 760, 761, 1024, and 1440 CSS pixels in light/dark themes. All **72 combinations** of live, mixed, pre-first-collection, query-error, unconfigured, and long-text states had the expected visible row count/state labels, no page horizontal overflow, and no browser errors. The frame used the existing application content width and desktop sidebar offset. Visible row text was at least 14px.
- Desktop/mobile screenshots verified both themes. A duplicate Cron is described as requiring review of multiple schedules, not as an absent job.
- This is isolated component rendering plus real backend/RPC/collection verification, not a claim of a new production Google-owner browser session. The existing approval-policy tests passed; real-account Google OAuth and mail delivery were not exercised.
- No files or stored disclosure data were deleted. Items 2–5, Web Push, PWA installation, new data providers, and retention cleanup remain outside this implementation.

## Sources

- Project conversation on 2026-09-22: five proposed enhancements, approval of item 1 only, and the subsequent commit/push/main-merge request.
- Read-only Supabase inspection on 2026-09-22: `cron.job` names/schedules/activity and whitelisted fields from the eight state tables; six ARK fund rows were inspected separately. No secrets or personal identifiers were retrieved.
- Repository: `supabase/burry-cron.sql`, `supabase/sec-managers-cron.sql`, `src/server/sec-state.ts`, `src/components/sec-manager-detail.tsx`, `src/app/(private)/admin/page.tsx`, and PWA/push implementation-path searches.
- Production endpoint results, saved-command requests, function privileges, and actual server-loader output observed on 2026-09-22; only safe result metadata was recorded.
- Local actual-migration PGlite smoke, `pnpm biome`, 70-test result, and the 72-case Chromium status-component matrix on 2026-09-22.
- [Hourly synchronization and Web Push](../decisions/hourly-sync-and-push.md), [two-snapshot retention](../decisions/two-snapshot-retention.md), and [Google OAuth access approval](../decisions/google-oauth-access.md).
