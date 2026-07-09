// Builds a standalone signed release artifact (APK or AAB) directly with Gradle —
// no connected device needed, unlike `expo run:android --variant release`. Always
// bumps the version first so every artifact has a unique, increasing versionCode.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { resolveBuildEnv } = require("./env");
const ensureReleaseSigning = require("./ensure-release-signing");
const bumpVersion = require("./bump-version");

const target = process.argv[2];
const TASKS = {
  apk: { gradleTask: "assembleRelease", outputHint: "android/app/build/outputs/apk/release/app-release.apk" },
  aab: { gradleTask: "bundleRelease", outputHint: "android/app/build/outputs/bundle/release/app-release.aab" },
};

const task = TASKS[target];
if (!task) {
  console.error("Uso: node scripts/gradle-build.js <apk|aab>");
  process.exit(1);
}

ensureReleaseSigning();
const { version, versionCode } = bumpVersion();

const androidDir = path.join(__dirname, "..", "android");
const gradlewCmd = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";

const result = spawnSync(gradlewCmd, [task.gradleTask], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
  env: resolveBuildEnv(),
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`\n[gradle-build] ${target.toUpperCase()} lista — versión ${version} (versionCode ${versionCode})`);
console.log(`[gradle-build] Archivo: ${task.outputHint}`);
