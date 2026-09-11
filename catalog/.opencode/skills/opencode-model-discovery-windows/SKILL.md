---
name: opencode-model-discovery-windows
description: Discover models available to the current OpenCode installation on Windows; use before recommending or assigning agent models.
compatibility: Windows and OpenCode CLI
---

# OpenCode model discovery on Windows

Use only the public OpenCode CLI as the source of truth. Never infer availability from a subscription, model name, or documentation example.

1. Check the CLI with `Get-Command opencode -ErrorAction SilentlyContinue` and `opencode --version`.
2. If it is missing, check existing `scoop`, `choco`, or `mise`; use an already installed package manager or the official standalone OpenCode Windows release. Do not install Node/npm just for OpenCode.
3. Refresh and list models with `opencode models --refresh` and `opencode models`.
4. Treat only returned `provider/model` lines as available. Build a runtime registry containing `provider`, `model`, and `id`.
5. On errors, report the error and do not invent a registry. `opencode auth list` may be checked without printing credentials.

Never print or save API keys, OAuth tokens, refresh tokens, or credential-file contents. When the user changes authentication or provider, replace the old registry by repeating discovery.

## Success

Discovery succeeds only when `opencode --version` and `opencode models` both succeed and the registry contains the returned identifiers.
