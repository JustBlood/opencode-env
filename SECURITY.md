# Security policy

## Scope

`opencode-env` generates local OpenCode configuration and can launch the local
OpenCode CLI for model discovery and optional read-only project analysis.

## Reporting

Please report security issues privately to the repository owner rather than
opening a public issue with exploit details.

## Important behavior

- The installer modifies only the current user's `PATH`.
- OpenCode installation is performed only after interactive confirmation.
- WSL installation runs the documented remote installer command.
- Project analysis is sent to the configured OpenCode provider through the
  local OpenCode CLI.
- Do not include secrets, credentials, private keys, or production settings in
  generated briefs or project instructions.
