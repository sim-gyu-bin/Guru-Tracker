---
title: Data Limitations
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md
updated: 2026-08-31
---

# Data Limitations

## Decided facts

SEC 13F data is periodic disclosure, not real-time holdings data; the product must never call or present it as real-time. ARK daily history missed while neither the primary scheduled sync nor the fallback access sync runs cannot be reconstructed later. U.S. House PTR details require source-document validation. Michael Burry option changes must not be used to infer exact option profit and loss.

Vercel Hobby Cron cannot provide the planned hourly schedule, so the schedule depends on Supabase Cron calling the protected internal endpoint. The hourly schedule reduces reliance on access but does not make source data real-time or reconstruct missed source history. These limits qualify [data freshness](../concepts/data-freshness.md), [source provenance](../concepts/source-provenance.md), and [hourly synchronization and Web Push](../decisions/hourly-sync-and-push.md).

## Deferred / open questions

How each limitation is communicated in the UI, the exact PTR normalization policy, source-specific validation details, and behavior during scheduler or delivery failure remain undecided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md) — retained disclosure and source-history limitations.
- [Hourly sync and push update](../../raw/sessions/2026-08-31-hourly-sync-and-push-update.md) — hourly scheduling constraint.
