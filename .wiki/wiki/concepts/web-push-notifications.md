---
title: Web Push Notifications
status: decided-with-open-questions
source_capture: ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# Web Push Notifications

## Decided facts

The planned notification transport is standards-based Web Push using a service worker and VAPID. A permission prompt is opt-in and may be requested only from a user gesture. For the conventional iOS flow, the user must install the PWA to the Home Screen; no Apple Developer account is required for PWA Web Push.

Only actual changes committed by the source-data transaction may be queued for delivery. The planned [outbox](../decisions/hourly-sync-and-push.md) isolates delivery failure from source-data persistence and uses unique event/document keys to prevent duplicates. A 404 or 410 delivery response removes the expired subscription.

## Deferred / open questions

Notification categories, recipients, per-user preferences, retry behavior, and the exact short retention period for delivered outbox rows and event history are not decided.

## Sources

- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md)
