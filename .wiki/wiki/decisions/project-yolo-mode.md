---
title: Project-Local OMP YOLO Mode
status: superseded
source_capture: ../../raw/sessions/2026-08-31-project-yolo-mode.md
updated: 2026-09-21
---

# Project-Local OMP YOLO Mode

## Decided facts

Guru Tracker inherits the current profile's global OMP settings without a repository-local `.omp/config.yml`, as specified in [`.omp/AGENTS.md`](../../../.omp/AGENTS.md). Approval policy and command patterns are not duplicated in the project. This page does not assert the effective global approval mode or per-tool settings.

## Superseded decision

The 2026-08-31 capture recorded a repository-local `tools.approvalMode: yolo` override, per-tool `allow` entries, and destructive shell-pattern denials. That local override is no longer the current project policy. The immutable capture and earlier log entry remain historical evidence, not instructions to recreate the configuration.

This approval policy changes tool prompting only. It does not authorize unrequested commits, deployments, external-account mutations, or other consequential real-world actions. Tool-enforced denial and provider-originated safety checks may still apply.

See the broader [technology stack](technology-stack.md) and the OMP instructions in [`.omp/AGENTS.md`](../../../.omp/AGENTS.md).

## Deferred / open questions

Any future approval-policy change must follow the current global instructions and explicit user authorization; this historical decision does not authorize relaxing approval controls.

## Sources

- [Project-local YOLO mode capture](../../raw/sessions/2026-08-31-project-yolo-mode.md) — superseded historical decision.
- Repository `.omp/AGENTS.md` — current global-settings inheritance policy.
- Project conversation on 2026-09-21 — approved correction of stale policy documentation; no human-owned raw capture was modified.
