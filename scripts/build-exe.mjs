import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "release");
const embeddedSource = join(root, "src", "embeddedCatalog.ts");
const catalog = {};
function collect(directory, prefix) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const key = `${prefix}/${name}`;
    if (statSync(path).isDirectory()) collect(path, key);
    else catalog[key.replaceAll("\\", "/")] = readFileSync(path, "utf8");
  }
}
collect(join(root, "catalog", ".opencode"), ".opencode");
catalog["template-manifest.json"] = readFileSync(join(root, "template-manifest.json"), "utf8");
catalog["opencode-env.install.json"] = JSON.stringify({ name: "opencode-env", version: 1 });
const original = readFileSync(embeddedSource, "utf8");
try {
  rmSync(release, { recursive: true, force: true });
  mkdirSync(release, { recursive: true });
  writeFileSync(embeddedSource, `export const embeddedFiles: Record<string, string> = ${JSON.stringify(catalog)};\n`);
  execFileSync("npx", ["esbuild", "src/cli.ts", "--bundle", "--platform=node", "--format=cjs", "--outfile=release/cli.cjs"], { cwd: root, stdio: "inherit", shell: true });
  execFileSync("npx", ["pkg", "--sea", "release/cli.cjs", "--output", "release/opencode-env.exe"], { cwd: root, stdio: "inherit", shell: true });
  const uninstaller = `const { existsSync, rmSync, writeFileSync } = require("node:fs");\nconst { spawn, spawnSync } = require("node:child_process");\nconst { join, dirname } = require("node:path");\nconst dir = dirname(process.execPath);\nconst marker = join(dir, "opencode-env.install.json");\nif (!existsSync(marker)) { console.error("This directory is not an opencode-env installation."); process.exit(1); }\nconst quotedDir = dir.replaceAll("'", "''");\nconst script = \`$d='\${quotedDir}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); [Environment]::SetEnvironmentVariable('Path', (($p -split ';' | Where-Object { $_ -and $_ -ne $d }) -join ';'), 'User')\`;\nspawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });\nfor (const name of ["opencode-env.exe", "template-manifest.json", "opencode-env.install.json"]) { try { rmSync(join(dir, name), { force: true }); } catch {} }\ntry { rmSync(join(dir, ".opencode"), { recursive: true, force: true }); } catch {}\nconst cleanup = join(dir, ".remove-opencode-env.cmd");\nwriteFileSync(cleanup, \`@echo off\r\nping 127.0.0.1 -n 3 > nul\r\ndel /q "\%~dp0opencode-env-uninstall.exe"\r\ndel /q "\%~dp0.remove-opencode-env.cmd"\r\nrmdir /q "\%~dp0"\r\n\`);\nspawn("cmd.exe", ["/d", "/c", cleanup], { detached: true, windowsHide: true, stdio: "ignore" }).unref();\nconsole.log("opencode-env removed. Open a new terminal to refresh PATH.");\n`;
  const uninstallerSource = join(release, "uninstaller.cjs");
  writeFileSync(uninstallerSource, uninstaller);
  execFileSync("npx", ["pkg", "--sea", uninstallerSource, "--output", "release/opencode-env-uninstall.exe"], { cwd: root, stdio: "inherit", shell: true });
  const payload = readFileSync(join(release, "opencode-env.exe")).toString("base64");
  const uninstallPayload = readFileSync(join(release, "opencode-env-uninstall.exe")).toString("base64");
  const filesPayload = Buffer.from(JSON.stringify(catalog), "utf8").toString("base64");
  const installer = `const { createInterface } = require("node:readline");\nconst { mkdirSync, writeFileSync } = require("node:fs");\nconst { spawnSync } = require("node:child_process");\nconst { join, dirname } = require("node:path");\nconst payload = Buffer.from(${JSON.stringify(payload)}, "base64");\nconst uninstallPayload = Buffer.from(${JSON.stringify(uninstallPayload)}, "base64");\nconst files = JSON.parse(Buffer.from(${JSON.stringify(filesPayload)}, "base64").toString("utf8"));\nconst defaultDir = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local"), "opencode-env");\nconst rl = createInterface({ input: process.stdin, output: process.stdout });\nrl.question(\`Install directory [\${defaultDir}]: \`, (answer) => {\n  rl.close();\n  const dir = answer.trim() || defaultDir;\n  mkdirSync(dir, { recursive: true });\n  writeFileSync(join(dir, "opencode-env.exe"), payload);\n  writeFileSync(join(dir, "opencode-env-uninstall.exe"), uninstallPayload);\n  for (const [name, content] of Object.entries(files)) { const path = join(dir, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }\n  const quotedDir = dir.replaceAll("'", "''");\n  const script = \`$d='\${quotedDir}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); $a=@($p -split ';' | Where-Object { $_ -and $_ -ne $d }); [Environment]::SetEnvironmentVariable('Path', (($a + $d) -join ';'), 'User')\`;\n  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });\n  if (result.error || result.status !== 0) { console.error(\`Could not add opencode-env to the user PATH: \${result.stderr ?? result.error?.message ?? "unknown error"}\`); process.exit(1); }\n  console.log(\`Installed to \${dir}. Open a new terminal, then run: opencode-env\`);\n});\n`;
  const installerSource = join(release, "installer.cjs");
  writeFileSync(installerSource, installer);
  execFileSync("npx", ["pkg", "--sea", installerSource, "--output", "release/opencode-env-setup.exe"], { cwd: root, stdio: "inherit", shell: true });
} finally {
  writeFileSync(embeddedSource, original);
}
