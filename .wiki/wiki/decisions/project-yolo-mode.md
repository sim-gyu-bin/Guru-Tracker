---
title: Project-Local OMP YOLO Mode
status: decided
source_capture: ../../raw/sessions/2026-08-31-project-yolo-mode.md
updated: 2026-08-31
---

# Project-Local OMP YOLO Mode

## Decided facts

Guru Tracker explicitly enables OMP `tools.approvalMode: yolo` in the repository-local `.omp/config.yml`. The override applies when OMP starts from this project root and does not change the user's global configuration or other repositories.

The project overrides inherited explicit prompts for `eval`, `browser`, `computer`, and `github` with `allow`. Destructive host and Git-history shell patterns are denied rather than prompted, preserving unattended operation without silently approving those operations. Project settings remain below CLI overlays and runtime flags in OMP precedence.

This approval policy changes tool prompting only. It does not authorize unrequested commits, deployments, external-account mutations, or other consequential real-world actions. Tool-enforced denial and provider-originated safety checks may still apply.

See the broader [technology stack](technology-stack.md) and the OMP instructions in [`.omp/AGENTS.md`](../../../.omp/AGENTS.md).

## Deferred / open questions

No additional per-tool exceptions are currently required. Revisit this decision only if a necessary development workflow is blocked or a new high-risk tool is added.

## Sources

- [Project-local YOLO mode capture](../../raw/sessions/2026-08-31-project-yolo-mode.md)
