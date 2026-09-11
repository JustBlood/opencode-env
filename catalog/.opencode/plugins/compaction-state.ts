import type { Plugin } from "@opencode-ai/plugin"

export const CompactionStatePlugin: Plugin = async () => ({
  "experimental.session.compacting": async (_input, output) => {
    const recovery = `
## OpenCode environment recovery

After compaction, before continuing:
1. Read AGENTS.md.
2. Read TASK_STATE.md.
3. Re-read the important files listed in TASK_STATE.md.
4. Re-activate the required skills listed in TASK_STATE.md when needed.
5. Preserve decisions, blockers, active files, and next steps from TASK_STATE.md.
`
    output.prompt = `${output.prompt ?? ""}\n${recovery}`
  },
})

export default CompactionStatePlugin
