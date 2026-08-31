---
title: Code Comment Policy
status: decided
source_capture: ../../raw/sessions/2026-08-31-code-comment-policy.md
updated: 2026-08-31
---

# Code Comment Policy

## Decided facts

Guru Tracker requires thorough Korean comments for exported APIs and core behavior. Comments must explain purpose, inputs and outputs, invariants, failure conditions, and the reasons behind non-obvious branches.

Comments are especially important around SEC 13F, ARK, and House PTR semantics; units; report and filing dates; time zones; security identifiers; snapshot rotation; synchronization; database transactions; and browser or platform workarounds. They must remain close to the affected code and change with it.

Thoroughness does not mean translating every assignment or return statement. Comments should preserve intent and external constraints that the code cannot express, while redundant line-by-line narration is prohibited because it becomes stale without adding knowledge.

This policy is enforced by the Korean OMP guidance in [`.omp/AGENTS.md`](../../../.omp/AGENTS.md) and [`.omp/RULES.md`](../../../.omp/RULES.md).

## Deferred / open questions

Language-specific documentation formats and any automated comment-coverage rule remain deferred until application code and its conventions exist.

## Sources

- [Code comment policy capture](../../raw/sessions/2026-08-31-code-comment-policy.md)
