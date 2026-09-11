#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embeddedFiles } from "./embeddedCatalog.js";

type Preset = "backend" | "frontend" | "universal";
type Brief = { name?: string; description?: string; commands?: string[]; constraints?: string[] };
type Catalog = {
  agents: string[];
  skills: string[];
  commands: string[];
  mcp: Record<string, { description: string; config: Record<string, unknown> }>;
  presets: Record<Preset, { agents: string[]; skills: string[]; commands: string[]; mcp: string[] }>;
  rules: string[];
  settings: Record<string, unknown>;
  requiredFiles: string[];
  requiredSkills: string[];
  compaction: { auto: boolean; prune: boolean; reserved: number };
};

const processInfo = process as NodeJS.Process & { pkg?: boolean; isSea?: () => boolean };
const packaged = Boolean(processInfo.pkg || processInfo.isSea?.() || /[\\/]opencode-env\.exe$/i.test(process.execPath));
const moduleRoot = packaged ? dirname(process.execPath) : typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));
const toolRoot = packaged ? moduleRoot : resolve(moduleRoot, "..");
const catalogRoot = join(toolRoot, packaged ? ".opencode" : "catalog", packaged ? "" : ".opencode");
const source = {
  agents: join(catalogRoot, "agents"),
  skills: join(catalogRoot, "skills"),
  commands: join(catalogRoot, "command"),
  plugins: join(catalogRoot, "plugins"),
};
function embeddedPath(path: string): string { return path.replaceAll("\\", "/"); }
function readCatalogFile(path: string): string {
  if (packaged) {
    if (existsSync(path)) return readFileSync(path, "utf8");
    const relativePath = embeddedPath(relative(catalogRoot, path));
    const key = !relativePath.startsWith("..") ? `.opencode/${relativePath}` : "template-manifest.json";
    const content = embeddedFiles[key];
    if (content === undefined) throw new Error(`Embedded catalog file not found: ${path}`);
    return content;
  }
  return readFileSync(path, "utf8");
}
const defaultAgents = ["build", "plan", "explore", "reviewer", "security", "docs"];
const defaultCommands = ["plan", "review", "test"];
const defaultSkills = ["opencode-model-discovery-windows", "opencode-agent-model-tuning", "security-review"];
const heavyAgents = new Set(["build", "plan", "architect", "backend", "frontend", "reviewer", "security"]);

function readJson(path: string): unknown { return JSON.parse(readFileSync(path, "utf8")); }
function arg(args: string[], name: string): string | undefined { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
function flag(args: string[], name: string): boolean { return args.includes(name); }
function csv(value: string | undefined): string[] { return (value ?? "").split(",").map((x) => x.trim()).filter(Boolean); }
function files(directory: string): string[] { return existsSync(directory) ? readdirSync(directory).filter((x) => statSync(join(directory, x)).isFile()) : []; }
function assertKnown(selected: string[], available: string[], category: string): void {
  const unknown = selected.filter((name) => !available.includes(name));
  if (unknown.length) throw new Error(`Unknown ${category}: ${unknown.join(", ")}`);
  if (selected.some((name) => !/^[a-zA-Z0-9._-]+$/.test(name))) throw new Error(`Unsafe ${category} name.`);
}
function normalizeDocumentSource(value: string, kind: "agents" | "brief"): string {
  const aliases: Record<string, string> = {
    generate: "generate with OpenCode", existing: kind === "agents" ? "use existing AGENTS.md" : "use existing project brief",
    template: kind === "agents" ? "use base template" : "use template", skip: "do not create brief",
    "сгенерировать через OpenCode": "generate with OpenCode", "использовать существующий AGENTS.md": "use existing AGENTS.md",
    "использовать существующий project brief": "use existing project brief", "использовать существующее описание проекта": "use existing project brief", "использовать базовый шаблон": "use base template",
    "использовать шаблон": "use template", "не создавать project brief": "do not create brief", "не создавать описание проекта": "do not create brief",
  };
  return aliases[value] ?? value;
}

function loadCatalog(path?: string): Catalog {
  const manifest = JSON.parse(path ? readFileSync(resolve(path), "utf8") : readCatalogFile(join(toolRoot, "template-manifest.json"))) as Partial<Catalog>;
  return {
    agents: manifest.agents ?? defaultAgents,
    skills: manifest.skills ?? defaultSkills,
    commands: manifest.commands ?? defaultCommands,
    mcp: manifest.mcp ?? {
      context7: { description: "Актуальная документация через Context7", config: { type: "remote", url: "https://mcp.context7.com/mcp", enabled: true } },
      playwright: { description: "Локальная браузерная проверка через Playwright", config: { type: "local", command: ["npx", "-y", "@playwright/mcp@latest"], enabled: true } },
    },
    presets: manifest.presets ?? {
      backend: { agents: defaultAgents, skills: ["opencode-model-discovery-windows", "opencode-agent-model-tuning", "security-review"], commands: defaultCommands, mcp: ["context7"] },
      frontend: { agents: defaultAgents, skills: ["opencode-model-discovery-windows", "opencode-agent-model-tuning", "security-review", "playwright-e2e"], commands: defaultCommands, mcp: ["context7", "playwright"] },
      universal: { agents: defaultAgents, skills: defaultSkills, commands: defaultCommands, mcp: ["context7"] },
    },
    rules: manifest.rules ?? ["Keep generated configuration portable; do not add machine-specific absolute paths."],
    settings: manifest.settings ?? {},
    requiredFiles: manifest.requiredFiles ?? ["AGENTS.md", "TASK_STATE.md"],
    requiredSkills: manifest.requiredSkills ?? ["opencode-model-discovery-windows", "opencode-agent-model-tuning"],
    compaction: manifest.compaction ?? { auto: true, prune: true, reserved: 10000 },
  };
}

function normalizePreset(value: string): Preset {
  const aliases: Record<string, Preset> = { generic: "universal", "react-vite": "frontend", "spring-boot": "backend", node: "backend", python: "backend" };
  return aliases[value] ?? value as Preset;
}

async function selectMany(rl: ReturnType<typeof createInterface>, title: string, values: string[], defaults: string[]): Promise<string[]> {
  console.log(`\n${title}`);
  values.forEach((value, index) => console.log(`  ${index + 1}. ${value}${defaults.includes(value) ? " [по умолчанию]" : ""}`));
  const answer = await rl.question("Введите номера через запятую, Enter — варианты по умолчанию, 0 — ничего: ");
  if (!answer.trim()) return defaults;
  if (answer.trim() === "0") return [];
  return answer.split(",").map((value) => values[Number(value.trim()) - 1]).filter(Boolean);
}

async function askChoice(title: string, choices: string[]): Promise<string> {
  const rl = createInterface({ input, output });
  console.log(`\n${title}`);
  choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}`));
  const answer = await rl.question("Введите номер: ");
  rl.close();
  const selected = choices[Number(answer.trim()) - 1];
  if (!selected) throw new Error("Invalid selection.");
  return selected;
}

function sanitizeAgent(content: string): string {
  return content.split("\n").filter((line) => !/^\s*model:\s*/i.test(line) && !/^[ \t]+["']?[A-Z]:\\Users\\/i.test(line)).join("\n");
}

function runProcess(executable: string, args: string[], options: { cwd?: string; shell?: boolean; input?: string } = {}): Promise<{ status: number | null; stdout: string; stderr: string; error?: Error }> {
  return new Promise((resolveProcess) => {
    const child = spawn(executable, args, { cwd: options.cwd, shell: options.shell, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => resolveProcess({ status: null, stdout, stderr, error }));
    child.on("close", (status) => resolveProcess({ status, stdout, stderr }));
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

async function withSpinner<T>(message: string, action: () => Promise<T>): Promise<T> {
  if (!output.isTTY) return action();
  let step = 1;
  const render = () => { output.write(`\r${message}${".".repeat(step)}   `); step = step === 3 ? 1 : step + 1; };
  render();
  const timer = setInterval(render, 450);
  try { return await action(); } finally { clearInterval(timer); output.write(`\r${" ".repeat(message.length + 5)}\r`); }
}

async function runOpenCode(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string; error?: Error }> {
  if (hasOpenCode()) {
    const executable = process.platform === "win32" ? "opencode.cmd" : "opencode";
    return runProcess(executable, args, { shell: process.platform === "win32" });
  }
  if (hasWslOpenCode()) {
    const command = `opencode ${args.map((value) => `'${value.replaceAll("'", "'\\''")}'`).join(" ")}`;
    return runProcess("wsl.exe", ["sh", "-lc", command]);
  }
  return { status: 127, stdout: "", stderr: "OpenCode не найден в Windows PATH или WSL." };
}

async function runOpenCodeAnalysis(project: string, prompt: string): Promise<string> {
  const args = ["run", "--agent", "plan", "--format", "json"];
  const result = hasOpenCode()
    ? await runProcess("opencode.cmd", args, { cwd: project, input: prompt, shell: true })
    : await runProcess("wsl.exe", ["--cd", project, "--", "opencode", ...args], { cwd: project, input: prompt });
  if (result.error || result.status !== 0) throw new Error(`OpenCode project analysis failed. ${result.stderr ?? result.error?.message ?? ""}`.trim());
  const lines = `${result.stdout ?? ""}`.split(/\r?\n/).filter(Boolean);
  const text = lines.flatMap((line) => {
    try {
      const event = JSON.parse(line) as { type?: string; text?: string; part?: { text?: string } };
      return event.type === "text" ? [event.part?.text ?? event.text ?? ""] : [];
    } catch { return []; }
  }).join("");
  return text || `${result.stdout ?? ""}`.trim();
}

function validateGeneratedText(text: string, label: string): void {
  if (!text.trim()) throw new Error(`OpenCode returned an empty ${label}.`);
  if (text.length > 30000) throw new Error(`Generated ${label} is too large; no files were generated.`);
  const secretValue = /(?:api[_-]?key|access[_-]?token|password|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[^\s"']{8,}/i;
  const keyBlock = /-----BEGIN [A-Z ]+ PRIVATE KEY-----/i;
  const knownToken = /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/;
  if (secretValue.test(text) || keyBlock.test(text) || knownToken.test(text)) throw new Error(`Generated ${label} appears to contain secret-like data; no files were generated.`);
}

function extractSection(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  return from >= 0 && to >= 0 ? text.slice(from + start.length, to).trim() : "";
}

async function generateProjectDocuments(project: string, requested: "agents" | "brief" | "both"): Promise<{ agents?: string; brief?: string }> {
  const prompt = `Analyze the project in the current directory in read-only mode. Do not edit, create, delete, or rename files. Do not read or output .env files, credentials, tokens, passwords, private keys, or production configuration. Do not include absolute machine-specific paths. Separate confirmed facts from unknowns. Return exactly these delimiter sections and no other commentary:\n===PROJECT_BRIEF===\nMarkdown project brief with Product, Stack, Verification, Constraints, Important files, and Unknowns.\n===AGENTS_FACTS===\nPortable project facts and verification instructions for AGENTS.md. Never weaken safety rules.\n===END===`;
  const output = await withSpinner("Генерация описаний проекта через OpenCode", () => runOpenCodeAnalysis(project, prompt));
  const brief = requested === "agents" ? undefined : extractSection(output, "===PROJECT_BRIEF===", "===AGENTS_FACTS===");
  const agents = requested === "brief" ? undefined : extractSection(output, "===AGENTS_FACTS===", "===END===");
  if (brief !== undefined) validateGeneratedText(brief, "project brief");
  if (agents !== undefined) validateGeneratedText(agents, "AGENTS.md facts");
  return { brief, agents };
}

async function discoverModels(): Promise<string[]> {
  await withSpinner("Поиск доступных моделей OpenCode", () => runOpenCode(["models", "--refresh"]));
  const result = await withSpinner("Получение списка моделей", () => runOpenCode(["models"]));
  if (result.error || result.status !== 0) throw new Error(`Unable to run OpenCode model discovery. Ensure OpenCode is installed and configured, then retry. ${result.stderr ?? result.error?.message ?? ""}`.trim());
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  const models = [...new Set(output.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/.test(line)))];
  if (!models.length) throw new Error("'opencode models' returned no provider/model identifiers; no environment was generated.");
  return models;
}

function hasOpenCode(): boolean {
  const executable = process.platform === "win32" ? "opencode.cmd" : "opencode";
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [executable], { encoding: "utf8", windowsHide: true, shell: process.platform === "win32" });
  return result.status === 0;
}

function hasWslOpenCode(): boolean {
  if (process.platform !== "win32") return false;
  const result = spawnSync("wsl.exe", ["sh", "-lc", "command -v opencode"], { encoding: "utf8", windowsHide: true });
  return result.status === 0;
}

async function discoverModelsWithInstall(): Promise<string[]> {
  if (!hasOpenCode() && !hasWslOpenCode()) {
    console.log("OpenCode не найден в Windows PATH или WSL.");
    if (!input.isTTY || !(await askYes("Установить OpenCode доступным способом сейчас?"))) throw new Error("OpenCode необходим. Установите его, откройте новый терминал и повторите команду.");
    const candidates: Array<[string, string]> = [["wsl", "wsl.exe"], ["scoop", "scoop.cmd"], ["choco", "choco.cmd"], ["npm", "npm.cmd"]];
    const selected = candidates.find(([command, executable]) => spawnSync(executable, [command === "wsl" ? "--status" : "--version"], { encoding: "utf8", windowsHide: true, shell: process.platform === "win32" }).status === 0);
    if (!selected) throw new Error("OpenCode could not be installed automatically. Install the 'opencode' command manually; the easiest option is to ask an OpenCode agent to install it for you. You can also use WSL: curl -fsSL https://opencode.ai/install | bash, or 'npm install -g opencode-ai', 'scoop install opencode', or 'choco install opencode'.");
    console.log(`Установка OpenCode через ${selected[0]}...`);
    const installArgs = selected[0] === "wsl" ? ["sh", "-lc", "curl -fsSL https://opencode.ai/install | bash"] : selected[0] === "scoop" ? ["install", "opencode"] : selected[0] === "choco" ? ["install", "opencode", "-y"] : ["install", "-g", "opencode-ai"];
    const result = spawnSync(selected[1], installArgs, { encoding: "utf8", windowsHide: false, shell: process.platform === "win32", stdio: "inherit" });
    if (result.status !== 0 || (!hasOpenCode() && !hasWslOpenCode())) throw new Error("Установка OpenCode не завершилась. Установите команду 'opencode' вручную или попросите OpenCode-агента сделать это, затем повторите команду.");
  }
  return discoverModels();
}

function chooseModel(agent: string, models: string[]): string {
  const preferred = heavyAgents.has(agent)
    ? ["gpt-5.5", "gpt-5.4", "claude-opus", "gpt-5", "claude-sonnet"]
    : ["mini", "flash", "haiku", "nano", "gpt-5.4", "gpt-5.5", "claude-sonnet"];
  return preferred.reduce<string | undefined>((selected, token) => selected ?? models.find((model) => model.toLowerCase().includes(token)), undefined) ?? models[0];
}

function pinAgentModel(content: string, model: string): string {
  const clean = sanitizeAgent(content);
  if (!model) return clean;
  const lines = clean.split("\n");
  const modeIndex = lines.findIndex((line) => /^mode:\s*/.test(line));
  lines.splice(modeIndex >= 0 ? modeIndex + 1 : 1, 0, `model: ${model}`);
  return lines.join("\n");
}

function generatedInstructions(preset: Preset, brief: Brief, rules: string[], projectFacts = ""): string {
  return `# OpenCode project instructions\n\n## Project\n\n- Name: ${brief.name ?? "Unnamed project"}\n- Preset: ${preset}\n- Brief: ${brief.description ?? "Add a short project description here."}\n\n## Safety\n\n- Never read, print, copy, or send .env files, credentials, tokens, passwords, private keys, or production configuration.\n- Do not access production or staging systems without explicit approval.\n- Do not run destructive commands, migrations, deployments, or force pushes without explicit approval.\n- A submitted operation is not necessarily a successful or completed operation.\n\n## Recovery after compaction\n\n- Read \`AGENTS.md\` and \`TASK_STATE.md\` before continuing a multi-step task.\n- Re-read the important files listed in \`TASK_STATE.md\`.\n- Re-activate required skills when they are needed; skills are loaded on demand.\n\n## Model policy\n\nModels are selected only from the successful local opencode models discovery. The model registry is saved in .opencode/model-registry.json. Use the agent model tuning skill to revise assignments after reviewing the live registry.\n\n## Verification\n\n${(brief.commands ?? []).map((command) => `- ${command}`).join("\n") || "- Document project-specific build, lint, test, and E2E commands here."}\n\n## Project facts\n\n${projectFacts || "- Add confirmed project facts here."}\n\n## Additional rules\n\n${rules.map((rule) => `- ${rule}`).join("\n")}\n`;
}

function generatedConfig(catalog: Catalog, selectedMcp: string[], selectedAgents: string[]): Record<string, unknown> {
  const { model: _model, small_model: _smallModel, ...portableSettings } = catalog.settings;
  const mcp = Object.fromEntries(selectedMcp.filter((name) => catalog.mcp[name]).map((name) => [name, catalog.mcp[name].config]));
  return { ...portableSettings, $schema: "https://opencode.ai/config.json", ...(selectedAgents.includes("build") ? { default_agent: "build" } : {}), share: "manual", snapshot: true, instructions: ["AGENTS.md", "TASK_STATE.md"], plugin: ["./.opencode/plugins/compaction-state.ts"], compaction: catalog.compaction, mcp, permission: {
    read: { "*": "allow", "**/.env": "deny", "**/.env.*": "deny", "**/*credentials*": "deny", "**/*password*": "deny", "**/*secret*": "deny", "**/*.pem": "deny", "**/*.key": "deny" },
    edit: "allow", bash: { "*": "ask", "git push*": "deny", "git reset --hard*": "deny", "git clean -fd*": "deny" }, external_directory: "deny",
  } };
}

async function init(project: string, args: string[]): Promise<void> {
  const catalog = loadCatalog(arg(args, "--manifest"));
  const explicitPreset = arg(args, "--preset") ?? arg(args, "--profile");
  const hasComponentSelection = ["--agents", "--skills", "--commands", "--mcp"].some((option) => arg(args, option) !== undefined);
  const customize = flag(args, "--customize") || (Boolean(input.isTTY) && !explicitPreset && !hasComponentSelection && !flag(args, "--dry-run"));
  const preset = explicitPreset as Preset | undefined ?? (customize ? undefined : "universal");
  const rl = customize ? createInterface({ input, output }) : undefined;
  const chosenPreset = normalizePreset(preset ?? (await rl?.question(`Preset [backend/frontend/universal] (по умолчанию universal): `) || "universal"));
  if (!catalog.presets[chosenPreset]) throw new Error(`Unknown preset: ${chosenPreset}`);
  const defaults = catalog.presets[chosenPreset];
  const selectedAgents = arg(args, "--agents") ? csv(arg(args, "--agents")) : (rl ? await selectMany(rl, "Субагенты", catalog.agents, defaults.agents) : defaults.agents);
  const requestedSkills = arg(args, "--skills") ? csv(arg(args, "--skills")) : (rl ? await selectMany(rl, "Skills", catalog.skills, defaults.skills) : defaults.skills);
  const selectedSkills = [...new Set([...catalog.requiredSkills, ...requestedSkills])];
  const mcpNames = Object.keys(catalog.mcp);
  const selectedMcp = arg(args, "--mcp") ? csv(arg(args, "--mcp")) : (rl ? await selectMany(rl, "MCP-серверы", mcpNames, defaults.mcp) : defaults.mcp);
  const selectedCommands = arg(args, "--commands") ? csv(arg(args, "--commands")) : (rl ? await selectMany(rl, "Команды", catalog.commands, defaults.commands) : defaults.commands);
  rl?.close();
  assertKnown(selectedAgents, catalog.agents, "agents");
  assertKnown(selectedSkills, catalog.skills, "skills");
  assertKnown(selectedCommands, catalog.commands, "commands");
  assertKnown(selectedMcp, mcpNames, "MCP");
  const brief: Brief = arg(args, "--brief") ? { description: readFileSync(resolve(arg(args, "--brief")!), "utf8") } : {};
  const dryRun = flag(args, "--dry-run");
  const force = flag(args, "--force");
  const existingAgents = existsSync(join(project, "AGENTS.md"));
  const existingBriefPath = ["project-brief.md", "PROJECT_BRIEF.md", join("docs", "project-brief.md")].map((name) => join(project, name)).find(existsSync);
  const agentsSource = normalizeDocumentSource(arg(args, "--agents-source") ?? (customize ? await askChoice("Источник AGENTS.md:", ["сгенерировать через OpenCode", "использовать существующий AGENTS.md", "использовать базовый шаблон"]) : "template"), "agents");
  const briefSource = normalizeDocumentSource(arg(args, "--brief-source") ?? (customize ? await askChoice("Краткое описание проекта:", ["сгенерировать через OpenCode", "использовать существующее описание проекта", "использовать шаблон", "не создавать описание проекта"]) : (arg(args, "--brief") ? "use existing project brief" : "do not create brief")), "brief");
  if (agentsSource === "use existing AGENTS.md" && !existingAgents) throw new Error("No existing AGENTS.md was found.");
  if (briefSource === "use existing project brief" && !arg(args, "--brief") && !existingBriefPath) throw new Error("No existing project brief was found.");
  const existing = [join(project, "AGENTS.md"), join(project, "opencode.json"), join(project, "TASK_STATE.md")].filter(existsSync);
  if (existing.length && !force && !dryRun) throw new Error(`Refusing to overwrite: ${existing.join(", ")}. Review and use --force.`);
  const write = (path: string, content: string) => { if (dryRun) console.log(`[dry-run] generate ${path}`); else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); } };
  const availableModels = dryRun ? [] : await discoverModelsWithInstall();
  const modelByAgent = Object.fromEntries(selectedAgents.map((agent) => [agent, chooseModel(agent, availableModels)]));
  let projectFacts = "";
  let generatedBrief = "";
  const needsAi = agentsSource === "generate with OpenCode" || briefSource === "generate with OpenCode";
  if (needsAi && !dryRun) { console.log("Анализ проекта через OpenCode в режиме только чтения..."); const generated = await generateProjectDocuments(project, agentsSource === "generate with OpenCode" && briefSource === "generate with OpenCode" ? "both" : agentsSource === "generate with OpenCode" ? "agents" : "brief"); projectFacts = generated.agents ?? ""; generatedBrief = generated.brief ?? ""; }
  const agentsContent = agentsSource === "use existing AGENTS.md" ? readFileSync(join(project, "AGENTS.md"), "utf8") : generatedInstructions(chosenPreset, brief, catalog.rules, projectFacts);
  const briefContent = briefSource === "use existing project brief" ? readFileSync(resolve(arg(args, "--brief") ?? existingBriefPath!), "utf8") : briefSource === "generate with OpenCode" ? generatedBrief : briefSource === "use template" ? "# Краткое описание проекта\n\n## Продукт\n\n## Стек\n\n## Проверка\n\n## Ограничения\n" : "";
  if (flag(args, "--reinit-delete") && existsSync(join(project, ".opencode")) && !dryRun) rmSync(join(project, ".opencode"), { recursive: true, force: true });
  if (agentsSource !== "use existing AGENTS.md") write(join(project, "AGENTS.md"), agentsContent);
  if (briefContent && briefSource !== "use existing project brief") write(join(project, "project-brief.md"), briefContent);
  write(join(project, "opencode.json"), `${JSON.stringify(generatedConfig(catalog, selectedMcp, selectedAgents), null, 2)}\n`);
  write(join(project, "TASK_STATE.md"), `# Task state\n\n## Goal\n\n## Current status\n\n## Completed\n\n## In progress\n\n## Decisions\n\n## Blockers\n\n## Next steps\n\n## Important files\n\n## Required skills\n${catalog.requiredSkills.map((skill) => `- ${skill}`).join("\n")}\n\n## Last compaction\n`);
  copyTemplate(join(source.plugins, "compaction-state.ts"), join(project, ".opencode", "plugins", "compaction-state.ts"), dryRun);
  for (const name of selectedAgents) copyTemplate(join(source.agents, `${name}.md`), join(project, ".opencode", "agents", `${name}.md`), dryRun, (content) => pinAgentModel(content, modelByAgent[name]));
  for (const name of selectedSkills) copyTemplate(join(source.skills, name, "SKILL.md"), join(project, ".opencode", "skills", name, "SKILL.md"), dryRun);
  for (const name of selectedCommands) copyTemplate(join(source.commands, `${name}.md`), join(project, ".opencode", "commands", `${name}.md`), dryRun);
  write(join(project, ".opencode", "environment-manifest.json"), `${JSON.stringify({ version: 2, preset: chosenPreset, agents: selectedAgents, skills: selectedSkills, mcp: selectedMcp, commands: selectedCommands, models: modelByAgent }, null, 2)}\n`);
  write(join(project, ".opencode", "model-registry.json"), `${JSON.stringify({ source: "opencode models", discoveredAt: new Date().toISOString(), models: availableModels.map((id) => ({ id, provider: id.split("/")[0], model: id.slice(id.indexOf("/") + 1) })), assignments: modelByAgent }, null, 2)}\n`);
  console.log(`${dryRun ? "Would initialize" : "Initialized"} ${project} (${chosenPreset})`);
}

async function askYes(question: string): Promise<boolean> {
  console.log(`\n${question}`);
  const rl = createInterface({ input, output });
  const answer = await rl.question("Confirm [y/N]: ");
  rl.close();
  return /^(y|yes|да)$/i.test(answer.trim());
}

async function reinit(project: string, args: string[]): Promise<void> {
  const directory = join(project, ".opencode");
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw new Error("Refusing to replace a symbolic-link .opencode directory.");
  const approved = flag(args, "--force") || flag(args, "--yes") || await askYes(`This will completely replace:\n  ${directory}\nContinue?`);
  if (!approved) { console.log("Reinitialization cancelled. No files were changed."); return; }
  const hasExplicitSelection = Boolean(arg(args, "--preset") ?? arg(args, "--profile")) || ["--agents", "--skills", "--commands", "--mcp"].some((option) => arg(args, option) !== undefined);
  await init(project, [...args, "--force", "--reinit-delete", ...(hasExplicitSelection ? [] : ["--customize"])]);
}

function existingNames(project: string, category: string): string[] {
  const directory = category === "agents" ? join(project, ".opencode", "agents") : category === "skills" ? join(project, ".opencode", "skills") : join(project, ".opencode", "commands");
  return existsSync(directory) ? readdirSync(directory).filter((name) => category === "skills" ? statSync(join(directory, name)).isDirectory() : name.endsWith(".md")).map((name) => name.replace(/\.md$/, "")) : [];
}

async function add(project: string, args: string[]): Promise<void> {
  const catalog = loadCatalog(arg(args, "--manifest"));
  const currentPath = join(project, ".opencode", "environment-manifest.json");
  const current = existsSync(currentPath) ? readJson(currentPath) as Record<string, unknown> : {};
  const interactive = flag(args, "--customize") || !["--agents", "--skills", "--commands", "--mcp"].some((option) => arg(args, option) !== undefined);
  const addRl = interactive ? createInterface({ input, output }) : undefined;
  const choose = async (option: string, title: string, values: string[], category: string): Promise<string[]> => {
    const requested = arg(args, option);
    if (requested !== undefined) return csv(requested);
    const installed = new Set(existingNames(project, category));
    if (!interactive) return [];
    console.log(`\n${title} (already installed: ${[...installed].join(", ") || "none"})`);
    return selectMany(addRl!, "Select additions", values, []);
  };
  const selectedAgents = await choose("--agents", "Agents", catalog.agents, "agents");
  const selectedSkills = await choose("--skills", "Skills", catalog.skills, "skills");
  const selectedCommands = await choose("--commands", "Commands", catalog.commands, "commands");
  const selectedMcp = await choose("--mcp", "MCP", Object.keys(catalog.mcp), "mcp");
  addRl?.close();
  assertKnown(selectedAgents, catalog.agents, "agents");
  assertKnown(selectedSkills, catalog.skills, "skills");
  assertKnown(selectedCommands, catalog.commands, "commands");
  assertKnown(selectedMcp, Object.keys(catalog.mcp), "MCP");
  const allSelected = [...selectedAgents, ...selectedSkills, ...selectedCommands, ...selectedMcp];
  if (!allSelected.length) { console.log("Nothing selected. No files were changed."); return; }
  const conflicts = [...selectedAgents.map((name) => join(project, ".opencode", "agents", `${name}.md`)), ...selectedSkills.map((name) => join(project, ".opencode", "skills", name, "SKILL.md")), ...selectedCommands.map((name) => join(project, ".opencode", "commands", `${name}.md`))].filter(existsSync);
  if (conflicts.length && !(flag(args, "--force") || flag(args, "--yes")) && !(await askYes(`These files already exist and will be replaced:\n${conflicts.join("\n")}`))) { console.log("Add cancelled. No files were changed."); return; }
  const availableModels = selectedAgents.length && !flag(args, "--dry-run") ? await discoverModelsWithInstall() : [];
  const assignments = { ...((current.models ?? {}) as Record<string, string>), ...Object.fromEntries(selectedAgents.map((name) => [name, chooseModel(name, availableModels)])) };
  const dryRun = flag(args, "--dry-run");
  for (const name of selectedAgents) copyTemplate(join(source.agents, `${name}.md`), join(project, ".opencode", "agents", `${name}.md`), dryRun, (content) => pinAgentModel(content, assignments[name]));
  for (const name of selectedSkills) copyTemplate(join(source.skills, name, "SKILL.md"), join(project, ".opencode", "skills", name, "SKILL.md"), dryRun);
  for (const name of selectedCommands) copyTemplate(join(source.commands, `${name}.md`), join(project, ".opencode", "commands", `${name}.md`), dryRun);
  const configPath = join(project, "opencode.json");
  if (selectedMcp.length && existsSync(configPath) && !dryRun) { const config = readJson(configPath) as Record<string, any>; config.mcp = { ...(config.mcp ?? {}), ...Object.fromEntries(selectedMcp.map((name) => [name, catalog.mcp[name].config])) }; writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`); }
  const merge = (key: string, values: string[]) => [...new Set([...((current[key] ?? []) as string[]), ...values])];
  const manifest = { ...current, version: 2, agents: merge("agents", selectedAgents), skills: merge("skills", selectedSkills), commands: merge("commands", selectedCommands), mcp: merge("mcp", selectedMcp), models: assignments };
  if (!dryRun) {
    mkdirSync(dirname(currentPath), { recursive: true });
    writeFileSync(currentPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (selectedAgents.length) writeFileSync(join(project, ".opencode", "model-registry.json"), `${JSON.stringify({ source: "opencode models", discoveredAt: new Date().toISOString(), assignments }, null, 2)}\n`);
  }
  console.log(`${dryRun ? "Would add components to" : "Added components to"} ${project}`);
}

function copyTemplate(from: string, to: string, dryRun: boolean, transform?: (content: string) => string): void {
  if (!packaged && !existsSync(from)) throw new Error(`Template not found: ${from}`);
  if (dryRun) { console.log(`[dry-run] ${relative(toolRoot, from)} -> ${to}`); return; }
  mkdirSync(dirname(to), { recursive: true });
  const content = readCatalogFile(from);
  writeFileSync(to, transform ? transform(content) : content);
}

function validate(project: string): number {
  const errors: string[] = [];
  try { const config = readJson(join(project, "opencode.json")) as Record<string, unknown>; if (config.$schema !== "https://opencode.ai/config.json") errors.push("invalid $schema"); if (config.model || config.small_model) errors.push("root model fields must be omitted; use agent assignments"); } catch { errors.push("opencode.json is missing or invalid"); }
  for (const file of ["AGENTS.md", ".opencode/agents/build.md", ".opencode/skills/opencode-model-discovery-windows/SKILL.md", ".opencode/skills/opencode-agent-model-tuning/SKILL.md", ".opencode/model-registry.json"]) if (!existsSync(join(project, file))) errors.push(`missing ${file}`);
  if (errors.length) { console.error(errors.join("\n")); return 1; }
  console.log(`Valid OpenCode environment: ${project}`); return 0;
}

function migrateModel(project: string, args: string[]): void {
  const from = arg(args, "--from") ?? "openai/gpt-4.1-mini";
  const to = arg(args, "--to") ?? "opencode/gpt-5.5";
  const dryRun = flag(args, "--dry-run");
  const directories = ["agents", "agent", "commands", "command"];
  const paths = [join(project, "opencode.json"), ...directories.flatMap((directory) => files(join(project, ".opencode", directory)).map((name) => join(project, ".opencode", directory, name)))];
  let changed = 0;
  for (const path of paths) { if (!existsSync(path)) continue; const content = readFileSync(path, "utf8"); if (!content.includes(from)) continue; changed++; if (dryRun) console.log(`[dry-run] update ${path}`); else writeFileSync(path, content.split(from).join(to)); }
  console.log(`${dryRun ? "Would update" : "Updated"} ${changed} file(s): ${from} -> ${to}`);
}

function list(): void { const catalog = loadCatalog(); console.log(`Presets: ${Object.keys(catalog.presets).join(", ")}\nAgents: ${catalog.agents.join(", ")}\nSkills: ${catalog.skills.join(", ")}\nMCP: ${Object.keys(catalog.mcp).join(", ")}\nCommands: ${catalog.commands.join(", ")}`); }

function help(): void {
  console.log(`Usage: opencode-env <command> [options]

Commands:
  init             Generate an OpenCode environment
  list             List presets and catalog entries
  validate         Validate an existing environment
  reinit           Replace the complete .opencode environment
  add              Add selected agents, skills, commands, or MCP
  help             Show this help

Init options:
  --preset NAME    backend, frontend, or universal
  --customize      Interactively choose components
  --agents LIST    Comma-separated agent names
  --skills LIST    Comma-separated skill names
  --mcp LIST       Comma-separated MCP names
  --commands LIST  Comma-separated command names
  --brief FILE     Файл с кратким описанием проекта
  --agents-source  сгенерировать, существующий файл или шаблон
  --brief-source   сгенерировать, существующий файл, шаблон или пропустить
  --project DIR    Target directory
  --dry-run        Preview without writing files
  --force          Allow replacing AGENTS.md and opencode.json`);
}

function installExecutable(): void {
  if (!packaged) throw new Error("The install command is available from the standalone executable.");
  const installDir = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local"), "opencode-env");
  const destination = join(installDir, "opencode-env.exe");
  mkdirSync(installDir, { recursive: true });
  if (resolve(process.execPath).toLowerCase() !== resolve(destination).toLowerCase()) copyFileSync(process.execPath, destination);
  const quotedDir = installDir.replaceAll("'", "''");
  const script = `$d='${quotedDir}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); $a=@($p -split ';' | Where-Object { $_ -and $_ -ne $d }); [Environment]::SetEnvironmentVariable('Path', (($a + $d) -join ';'), 'User')`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Could not add opencode-env to the user PATH: ${result.stderr ?? result.error?.message ?? "unknown error"}`);
  console.log(`Installed ${destination}. Open a new terminal, then run: opencode-env`);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const known = ["init", "reinit", "add", "list", "validate", "migrate-model", "help", "install"];
  const command = raw.length === 0 ? "help" : raw[0] && known.includes(raw[0]) ? raw.shift()! : "init";
  if (command === "help" || flag(raw, "--help") || flag(raw, "-h")) { help(); return; }
  if (command === "install") { installExecutable(); return; }
  const project = resolve(arg(raw, "--project") ?? process.cwd());
  if (command === "init") await init(project, raw); else if (command === "reinit") await reinit(project, raw); else if (command === "add") await add(project, raw); else if (command === "list") list(); else if (command === "validate") process.exitCode = validate(project); else if (command === "migrate-model") migrateModel(project, raw);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
