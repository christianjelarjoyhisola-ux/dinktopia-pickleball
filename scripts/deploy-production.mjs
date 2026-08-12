import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const wranglerRoot = path.join(root, ".wrangler");
const executable = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

run(["run", "build"]);

await mkdir(wranglerRoot, { recursive: true });
const stage = await mkdtemp(path.join(wranglerRoot, "pages-production-"));

try {
  await cp(path.join(root, "dist", "client"), stage, { recursive: true });
  await cp(path.join(root, "dist", "server"), path.join(stage, "_worker.js"), {
    recursive: true,
  });

  const commit = capture("git", ["rev-parse", "HEAD"]);
  run([
    "exec",
    "--",
    "wrangler",
    "pages",
    "deploy",
    stage,
    "--project-name",
    "dinktopia",
    "--branch",
    "main",
    "--commit-hash",
    commit,
  ]);
} finally {
  await rm(stage, { recursive: true, force: true });
}
