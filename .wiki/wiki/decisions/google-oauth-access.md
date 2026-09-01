---
title: Google OAuth Access Policy
status: decided-with-deferred-hardening
source_capture: []
decision_record:
  - project conversation, 2026-09-01
updated: 2026-09-01
---

# Google OAuth Access Policy

## Decided facts

Guru Tracker will use Supabase Auth with Google OAuth as its only initial sign-in method. Any person who completes Google authentication may create an account and use the application without a separate approval request. Email/password sign-up, Magic Links, invitation email flows, and custom SMTP are outside the initial authentication scope.

The initial admission policy minimizes owner administration, but distributing the Vercel URL only to family and acquaintances is not an access-control boundary. A forwarded, indexed, or otherwise discovered URL can be used by any Google account. All self-created users therefore receive ordinary member access only. Authentication must never grant synchronization, snapshot mutation, owner, or service-role capabilities.

Next.js will use Supabase's cookie-based SSR flow with a public login route, an OAuth callback route, and a Proxy that refreshes and validates authentication before protected application routes are served. Database authorization remains enforced by Row Level Security. User-owned records, including notification subscriptions and preferences, are limited to the matching authenticated user. Collection, synchronization, snapshot rotation, and Push outbox delivery remain server-only operations.

## Deferred whitelist hardening

Google OAuth remains the identity provider if admission later becomes restricted. A database-backed email allowlist can be introduced without changing the user-facing sign-in method.

The hardened path must use both boundaries:

1. A Supabase Before User Created Hook rejects a new OAuth identity before `auth.users` insertion when its normalized, verified email is not active in the allowlist.
2. Proxy and Row Level Security checks reject existing users whose membership is absent or revoked, because a creation hook alone cannot remove access already granted.

The allowlist schema belongs in migrations, but real family and acquaintance email addresses are private runtime data. They must be entered through Supabase or a protected owner operation and must not be committed to Git, README, Wiki, logs, or migration seed data. When hardening is enabled, existing users must be explicitly retained, revoked, or deleted rather than silently grandfathered.

## Deferred / open questions

The Google Cloud OAuth client, consent-screen publication state, Supabase redirect allowlist, exact membership schema, session policy, unknown-account review process, and threshold for enabling the allowlist are not yet configured. Authentication described here is a confirmed design decision, not an implemented feature.

## Sources

- Project conversation on 2026-09-01 — confirmed Google OAuth, open initial admission, no approval workflow, and a later database email allowlist option. No raw capture was added because `.wiki/raw` is human-owned.
- [Supabase Google login documentation](https://supabase.com/docs/guides/auth/social-login/auth-google) — provider and OAuth callback requirements.
- [Supabase Before User Created Hook documentation](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) — pre-creation rejection capability.
- [Supabase Next.js SSR documentation](https://supabase.com/docs/guides/auth/server-side/nextjs) — cookie clients, callback, claims validation, and Proxy responsibilities.
