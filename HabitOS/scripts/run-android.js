const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const FALLBACK_JDK_PATHS = [
  "C:\\Program Files\\Android\\Android Studio\\jbr",
  "C:\\Program Files\\Java\\jdk-21",
  "C:\\Program Files\\Eclipse Adoptium\\jdk-21",
];

function resolveJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  return FALLBACK_JDK_PATHS.find((candidate) => fs.existsSync(candidate));
}

const javaHome = resolveJavaHome();
if (!javaHome) {
  console.error(
    "No se encontró un JDK. Instala Android Studio o un JDK 17+ y define JAVA_HOME, " +
      "o agrega su ruta a FALLBACK_JDK_PATHS en scripts/run-android.js.",
  );
  process.exit(1);
}

const releaseFlag = process.argv.includes("--release") ? ["--variant", "release"] : [];
const result = spawnSync("npx", ["expo", "run:android", ...releaseFlag], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, JAVA_HOME: javaHome },
});

process.exit(result.status ?? 1);
