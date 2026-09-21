---
title: Google OAuth Access Approval Policy
status: decided-with-deferred-configuration
source_capture: []
decision_record:
  - project conversation, 2026-09-01
  - project conversation, 2026-09-18
updated: 2026-09-18
---

# Google OAuth Access Approval Policy

## Decided facts

Supabase Auth with Google OAuth remains the only sign-in method. The earlier open-admission policy is revoked: completing Google authentication no longer grants product access by itself. A first Google sign-in records an access request in the `pending` state, and only a record in the `approved` state may use the application. Email/password and Magic Link sign-in stay out of scope. Transactional email is introduced only for owner approval notifications through a provider API; the initial provider candidate is recorded as an implementation choice, not a product decision (see [technology stack](technology-stack.md)).

### Access states

The single source of access truth is the approval record in the database.

- `pending` — request recorded, no product access.
- `approved` — ordinary member access.
- `rejected` — the owner refused the request; no access.
- `revoked` — the owner withdrew previously approved access; no access.

A `rejected` or `revoked` person does not obtain a fresh `pending` request by signing in again, and the next server or API request is blocked. The owner can change a decision later from the same administration surface, including re-approving a rejected or revoked person. The administration UI and the approval email operate on the same database state; there is no second approval store or parallel decision list.

### Owner identity and administration

Exactly one owner exists. The owner is a verified Google identity bound to a database user id, and the server-only `ADMIN_EMAIL` value identifies the initial owner. It is never exposed to the browser, and the real address is private runtime data (see below). The owner binding is a single record keyed to one user id, and each decision carries the expected version of the target record, so a stale or replayed decision cannot overwrite a newer state.

The owner accepts, rejects, revokes, and re-approves requests from `/admin`, which lists the requests and their states.

### Routes

| Route | Purpose |
| --- | --- |
| `/`, `/privacy`, `/terms` | Public introduction, privacy policy, and terms, accessible without sign-in or approval (superseding the root redirect on 2026-09-21). |
| `/login` | Google sign-in entry point. |
| `/pending` | Status screen for a signed-in person who is awaiting a decision. |
| `/admin` | Owner screen for accept, reject, revoke, and re-approve. |
| `/main` | Browsing home; the current collection home moves here. |
| `/main/gurus/...` | Per-person disclosure detail pages under `/main`. |

### Approval notification email

A new `pending` request notifies the owner by email through the provider API. The message carries accept and reject links, and each link opens the `/admin` screen for that specific request. The link is an ordinary GET navigation with no side effect; the decision is applied only by a POST that follows the owner's Google sign-in as administrator. This separation is required because mail scanners, link prefetchers, and proxies may follow links in a GET request, so an emailed GET must never change access state.

The notification message is a convenience path, not the state. If sending fails, the request stays `pending` and remains actionable from `/admin`.

### Authorization boundaries

Ordinary users are constrained by the server, API routes, and Row Level Security of the Supabase SSR session flow, and user-owned records remain limited to the matching authenticated user. Collection, synchronization, snapshot rotation, and Push outbox delivery stay server-only. The internal cron endpoints keep their existing separate bearer authorization (`SYNC_SECRET`) and are not tied to the owner approval state.

### Real addresses stay private

Owner, family, and acquaintance email addresses are private runtime data. They must be entered through Supabase or a protected owner operation and must not appear in Git history, README, this Wiki, code, logs, or migration seed data.

## Superseded decision

The 2026-09-01 decision — every Google-authenticated account becomes an ordinary member without approval, with a database email allowlist as the only deferred restriction — is revoked. Distributing the deployment URL is not an access-control boundary, and open self-admission granted ordinary member access to any Google account. The deferred allowlist path is not carried forward; the owner approval workflow replaces it. The retained parts of that decision are the Google OAuth identity provider, the cookie-based SSR session flow with a public login route and an OAuth callback route, Proxy validation before protected routes, Row Level Security, and server-only mutation paths.

## Deferred / open questions

The Google Cloud OAuth client, consent-screen publication state, Supabase Google provider and redirect allowlist, remote migration application, provider email credentials, and production verification are not complete. The exact screen a `rejected` or `revoked` person sees, decision-history retention, and notification message content remain undecided. This page records confirmed decisions; repository implementation status is tracked in the project README and is not asserted here.

## Sources

- Project conversation on 2026-09-01 — initial Google OAuth admission decision, superseded on 2026-09-18. No raw capture was added because `.wiki/raw` is human-owned.
- Project conversation on 2026-09-18 — confirmed approval-gated access, the four access states, single-owner administration, the route map, the GET/POST email safety rule, and the separation of the mail provider choice from the product decision. No raw capture was added because `.wiki/raw` is human-owned.
- [Supabase Google login documentation](https://supabase.com/docs/guides/auth/social-login/auth-google) — provider and OAuth callback requirements.
- [Supabase Next.js SSR documentation](https://supabase.com/docs/guides/auth/server-side/nextjs) — cookie clients, callback, claims validation, and Proxy responsibilities.
- [Resend documentation](https://resend.com/docs) — candidate transactional email provider for owner notifications.
