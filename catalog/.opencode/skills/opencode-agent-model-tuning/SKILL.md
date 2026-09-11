---
name: opencode-agent-model-tuning
description: Assign and maintain models for individual OpenCode agents using the live discovered registry; use after model discovery when optimizing agent performance.
compatibility: OpenCode project-local
---

# OpenCode agent model tuning

This skill performs point-by-point model tuning for subagents. It must be run after `opencode-model-discovery-windows` or after the user supplies a fresh successful `opencode models` result.

1. Inspect the agent files and classify each task: implementation, architecture, exploration, review, security, testing, documentation, or UI.
2. Build a model matrix from the discovered `provider/model` registry only. Do not use a model absent from that registry.
3. Recommend a model per agent with a short reason, considering reasoning quality, tool use, latency, context, cost, and task risk.
4. Show the proposed diff before editing. Never change the primary/default model unless the user approves.
5. After approval, add `model: provider/model` only to the selected agent frontmatter. Leave unselected agents inheriting OpenCode's default model.
6. Validate every configured identifier against the registry and report agents that intentionally remain unpinned.

Do not inspect or expose credentials. Do not silently replace models after an availability error; rerun discovery and present a new proposal. Explain that OpenCode must be restarted after config-time agent changes.

## Recommended output

Return a table with agent, task class, selected model, alternative, rationale, and availability evidence, followed by the exact diff and verification result.
