---
title: Position Diff
status: decided-with-open-questions
source_capture: ../../raw/sessions/2026-08-31-project-brainstorm.md
updated: 2026-08-31
---

# Position Diff

## Decided facts

A position diff is the comparison of two retained snapshots. The system keeps only the current validated dataset and its immediate predecessor, so comparison scope is bounded to adjacent versions. New source content must validate and rotate atomically before it can become the current side of a diff; see [two-snapshot retention](../decisions/two-snapshot-retention.md).

For Michael Burry, a diff must not be presented as an exact option profit-and-loss calculation.

## Deferred / open questions

Identity matching, holdings versus transaction representations, aggregation rules, labels, and visual presentation are undecided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md)
