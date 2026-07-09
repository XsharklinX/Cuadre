const { spawnSync } = require("node:child_process");

const { resolveBuildEnv } = require("./env");

const releaseFlag = process.argv.includes("--release") ? ["--variant", "release"] : [];
if (releaseFlag.length > 0) {
  require("./ensure-release-signing")();
  require("./bump-version")();
}

const result = spawnSync("npx", ["expo", "run:android", ...releaseFlag], {
  stdio: "inherit",
  shell: true,
  env: resolveBuildEnv(),
});

process.exit(result.status ?? 1);
