---
title: Language Policy
status: decided-with-open-questions
source_capture:
  - ../../raw/sessions/2026-08-31-project-brainstorm.md
  - ../../raw/sessions/2026-08-31-code-comment-policy.md
updated: 2026-08-31
---

# Language Policy

## Decided facts

OMP files, skills, agents, README, UI copy, and commit messages use Korean. Structural names, filenames, frontmatter keys, and code, API, and database identifiers use English. Human-owned evidence in `.wiki/raw/` preserves its source language; LLM-owned synthesis in `.wiki/wiki/` is English for the initial knowledge pages. The governing rules are in the [Wiki guidance](../../AGENTS.md).

Code identifiers remain English, but explanatory comments for exported APIs, core domain behavior, non-obvious control flow, and external data constraints are Korean. Comments explain intent and invariants rather than narrating obvious syntax; see the [code comment policy](code-comment-policy.md).

## Deferred / open questions

Translation workflow, localization coverage beyond the stated Korean UI copy, and language review ownership are undecided.

## Sources

- [Project brainstorm capture](../../raw/sessions/2026-08-31-project-brainstorm.md)
- [Code comment policy capture](../../raw/sessions/2026-08-31-code-comment-policy.md)
