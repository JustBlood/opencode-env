# opencode-env

Windows-first generator for a local OpenCode project environment. It creates a
transparent, inspectable project setup instead of silently guessing the project
type.

## Fastest path

From any project directory, after installing the standalone installer:

```powershell
opencode-env
```

With no arguments it shows help. Run `opencode-env init` to interactively choose
the preset and components. In non-interactive usage, `universal` is used only
when no preset is supplied. Use `opencode-env reinit` to replace the complete
`.opencode` environment, or `opencode-env add` to add selected components.

## Installation

On a target Windows PC, download the installer `opencode-env-setup.exe` and
run it once (double-click or from PowerShell). It asks for an installation
directory, places the utility, manifest, templates, and uninstaller there, and
updates the user PATH automatically:

```powershell
.\opencode-env-setup.exe
```

Open a new PowerShell window. The installer copies the standalone executable to
`%LOCALAPPDATA%\opencode-env` by default and adds that directory to the current
user's PATH. Node.js is not required on the target machine.

To remove the installation, run `opencode-env-uninstall.exe` from the selected
installation directory, then open a new terminal.

For a source checkout, `npm run build:exe` produces
`release/opencode-env-setup.exe` and the embedded utility executable.

## Options

```text
  opencode-env                         # show help
  opencode-env init                    # interactive preset/component setup
  opencode-env init --preset universal # explicit non-interactive setup
  opencode-env reinit                  # interactive replacement of .opencode
  opencode-env add                     # add selected components
  opencode-env --customize          # interactive preset and component selection
  opencode-env --preset backend     # backend-only preset
  opencode-env --preset frontend    # frontend-only preset
  opencode-env --preset universal   # universal preset
  opencode-env --project C:\path\app # target another directory
  opencode-env --dry-run            # preview without writing files
  opencode-env --agents build,plan  # explicit component selection
  opencode-env --skills security-review,opencode-model-discovery-windows
  opencode-env --mcp context7
  opencode-env --commands plan,test
  opencode-env list
  opencode-env validate
```

`init` and `reinit` require OpenCode for model discovery. If OpenCode is
missing, the CLI offers installation through WSL (recommended for compatibility):

```bash
curl -fsSL https://opencode.ai/install | bash
```

Other supported methods are `scoop install opencode`, `choco install opencode
-y`, and `npm install -g opencode-ai`. WSL OpenCode is used through `wsl.exe`.
`add` only requires OpenCode when adding agents; adding skills, commands, or MCP
entries does not perform model discovery.

The catalog is configurable in `template-manifest.json`. Add files to
`catalog/.opencode/agents`, `catalog/.opencode/skills`, or
`catalog/.opencode/command` and list them in the manifest. During initialization the CLI runs the local
`opencode models` command and assigns each selected agent a model from that
live registry. If discovery fails, no environment is generated.

## Model workflow

Every initial preset includes:

- `opencode-model-discovery-windows`: obtains the live registry from
  `opencode models` without exposing credentials;
- `opencode-agent-model-tuning`: proposes and, after approval, pins a model per
  selected subagent.

After generation, restart OpenCode and run the discovery skill first. Then use
the tuning skill to distribute models by agent responsibility. Every generated
project also receives `TASK_STATE.md` and a compaction plugin; the default
configuration enables automatic compaction with pruning and a reserved buffer.

In interactive initialization, the CLI can ask OpenCode's default model to
produce a read-only project analysis. The user chooses independently whether
to generate `AGENTS.md` and `project-brief.md`, keep existing files, or use a
template. AI output is previewed and checked before it is written.

## Safety

- `.env`, credentials, tokens, passwords, private keys, and production config
  are never copied or printed.
- Existing `AGENTS.md` and `opencode.json` are not overwritten unless
  `--force` is supplied.
- `apply`/review workflows must be approved explicitly.
