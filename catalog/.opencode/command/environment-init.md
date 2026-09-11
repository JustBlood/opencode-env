---
description: Bootstrap a reusable OpenCode environment in another local project
agent: build
---

Use the local `opencode-env` CLI in this repository to initialize the target project described in `$ARGUMENTS`.

Requirements:
- Ask for or locate a project brief before applying project-specific settings.
- Run `list` and an `init --dry-run` first.
- Never copy secrets or `.env` files.
- Show the generated diff and request approval before using `--force`.
- Tell the user to restart OpenCode after config-time files are created.
