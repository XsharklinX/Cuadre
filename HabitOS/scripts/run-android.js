const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const FALLBACK_JDK_PATHS = [
  "C:\\Program Files\\Android\\Android Studio\\jbr",
  "C:\\Program Files\\Java\\jdk-21",
  "C:\\Program Files\\Eclipse Adoptium\\jdk-21",
];

const FALLBACK_SDK_PATHS = [
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
  path.join(process.env.USERPROFILE || "", "AppData", "Local", "Android", "Sdk"),
];

function resolveJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  return FALLBACK_JDK_PATHS.find((candidate) => fs.existsSync(candidate));
}

function resolveAndroidHome() {
  if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) {
    return process.env.ANDROID_HOME;
  }
  return FALLBACK_SDK_PATHS.find((candidate) => candidate && fs.existsSync(candidate));
}

const javaHome = resolveJavaHome();
if (!javaHome) {
  console.error(
    "No se encontró un JDK. Instala Android Studio o un JDK 17+ y define JAVA_HOME, " +
      "o agrega su ruta a FALLBACK_JDK_PATHS en scripts/run-android.js.",
  );
  process.exit(1);
}

const androidHome = resolveAndroidHome();
if (!androidHome) {
  console.error(
    "No se encontró el SDK de Android. Instálalo desde Android Studio y define ANDROID_HOME, " +
      "o agrega su ruta a FALLBACK_SDK_PATHS en scripts/run-android.js.",
  );
  process.exit(1);
}

const releaseFlag = process.argv.includes("--release") ? ["--variant", "release"] : [];
const result = spawnSync("npx", ["expo", "run:android", ...releaseFlag], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
  },
});

process.exit(result.status ?? 1);
