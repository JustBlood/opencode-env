import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const cli = join(process.cwd(), "dist", "cli.js");

test("no arguments show help instead of initializing", () => {
  const output = execFileSync(process.execPath, [cli], { encoding: "utf8" });
  assert.match(output, /Usage: opencode-env/);
  assert.doesNotMatch(output, /Initialized/);
});

function mockOpenCode(project) {
  const bin = join(project, "mock-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "opencode.cmd"), "@echo opencode/gpt-5.5\r\n");
  return { ...process.env, PATH: `${bin};${process.env.PATH}` };
}

test("init creates a profile-specific environment and validate accepts it", () => {
  const project = mkdtempSync(join(tmpdir(), "opencode-env-"));
  try {
    execFileSync(process.execPath, [cli, "init", "--project", project, "--profile", "react-vite"], { stdio: "pipe", env: mockOpenCode(project) });
    const config = JSON.parse(readFileSync(join(project, "opencode.json"), "utf8"));
    assert.equal(config.$schema, "https://opencode.ai/config.json");
    assert.equal(config.mcp.playwright.enabled, true);
    assert.equal(config.model, undefined);
    assert.equal(readFileSync(join(project, ".opencode", "agents", "build.md"), "utf8").includes("model: opencode/gpt-5.5"), true);
    assert.equal(execFileSync(process.execPath, [cli, "validate", "--project", project], { encoding: "utf8" }).includes("Valid"), true);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("explicit init defaults to the universal preset without prompts", () => {
  const project = mkdtempSync(join(tmpdir(), "opencode-env-"));
  try {
    execFileSync(process.execPath, [cli, "init", "--project", project], { stdio: "pipe", env: mockOpenCode(project) });
    const manifest = JSON.parse(readFileSync(join(project, ".opencode", "environment-manifest.json"), "utf8"));
    assert.equal(manifest.preset, "universal");
    assert.equal(manifest.models.build, "opencode/gpt-5.5");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("init refuses overwrite without force and never copies secret-like files", () => {
  const project = mkdtempSync(join(tmpdir(), "opencode-env-"));
  try {
    writeFileSync(join(project, "opencode.json"), "{}\n");
    const env = mockOpenCode(project);
    assert.throws(() => execFileSync(process.execPath, [cli, "init", "--project", project, "--profile", "generic"], { stdio: "pipe", env }));
    execFileSync(process.execPath, [cli, "init", "--project", project, "--profile", "generic", "--force"], { stdio: "pipe", env });
    assert.equal(readFileSync(join(project, "opencode.json"), "utf8").includes("$schema"), true);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("migrate-model updates obsolete agent model identifiers", () => {
  const project = mkdtempSync(join(tmpdir(), "opencode-env-"));
  try {
    const agents = join(project, ".opencode", "agents");
    mkdirSync(agents, { recursive: true });
    writeFileSync(join(agents, "plan.md"), "model: openai/gpt-4.1-mini\n");
    execFileSync(process.execPath, [cli, "migrate-model", "--project", project], { stdio: "pipe" });
    assert.equal(readFileSync(join(agents, "plan.md"), "utf8"), "model: opencode/gpt-5.5\n");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("reinit replaces the complete .opencode tree and init uses universal by default", () => {
  const project = mkdtempSync(join(tmpdir(), "opencode-env-"));
  try {
    writeFileSync(join(project, "package.json"), "{}\n");
    execFileSync(process.execPath, [cli, "init", "--project", project], { stdio: "pipe", env: mockOpenCode(project) });
    assert.equal(JSON.parse(readFileSync(join(project, ".opencode", "environment-manifest.json"), "utf8")).preset, "universal");
    mkdirSync(join(project, ".opencode", "custom"), { recursive: true });
    writeFileSync(join(project, ".opencode", "custom", "keep-me.md"), "custom\n");
    execFileSync(process.execPath, [cli, "reinit", "--project", project, "--preset", "frontend", "--force"], { stdio: "pipe", env: mockOpenCode(project) });
    assert.equal(existsSync(join(project, ".opencode", "custom")), false);
    assert.equal(JSON.parse(readFileSync(join(project, ".opencode", "environment-manifest.json"), "utf8")).preset, "frontend");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("add patches selected components without replacing root config", () => {
  const project = mkdtempSync(join(tmpdir(), "opencode-env-"));
  try {
    const env = mockOpenCode(project);
    execFileSync(process.execPath, [cli, "init", "--project", project, "--agents", "build", "--skills", "security-review", "--commands", "plan", "--mcp", "context7"], { stdio: "pipe", env });
    const before = readFileSync(join(project, "opencode.json"), "utf8");
    execFileSync(process.execPath, [cli, "add", "--project", project, "--skills", "react-vite"], { stdio: "pipe", env });
    assert.equal(existsSync(join(project, ".opencode", "skills", "react-vite", "SKILL.md")), true);
    assert.equal(readFileSync(join(project, "opencode.json"), "utf8"), before);
    assert.deepEqual(JSON.parse(readFileSync(join(project, ".opencode", "environment-manifest.json"), "utf8")).agents, ["build"]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
