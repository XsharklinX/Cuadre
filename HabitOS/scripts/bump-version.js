// Bumps android.versionCode (Play Console requires each upload to have a strictly
// higher versionCode than the last one it accepted) and the patch segment of the
// marketing `version` string. Runs automatically before every release build
// (APK, AAB, or `npm run android:release`) so this never has to be done by hand.
const fs = require("node:fs");
const path = require("node:path");

const APP_JSON_PATH = path.join(__dirname, "..", "app.json");

function bumpPatch(version) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }
  parts[2] += 1;
  return parts.join(".");
}

function bumpVersion() {
  const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, "utf8"));
  const expo = appJson.expo;

  const previousVersionCode = expo.android?.versionCode ?? 0;
  const nextVersionCode = previousVersionCode + 1;
  const previousVersion = expo.version ?? "0.1.0";
  const nextVersion = bumpPatch(previousVersion);

  expo.version = nextVersion;
  expo.android = { ...expo.android, versionCode: nextVersionCode };

  fs.writeFileSync(APP_JSON_PATH, `${JSON.stringify(appJson, null, 2)}\n`);
  syncAndroidBuildGradle(nextVersion, nextVersionCode);

  console.log(
    `[bump-version] version ${previousVersion} -> ${nextVersion}, versionCode ${previousVersionCode} -> ${nextVersionCode}`,
  );

  return { version: nextVersion, versionCode: nextVersionCode };
}

// android/ is gitignored and only re-synced from app.json on a full `expo prebuild`,
// which isn't guaranteed to run before every build script here — so this patches
// the literal versionCode/versionName lines directly, every time, to guarantee they
// never drift from app.json regardless of whether prebuild ran in between.
function syncAndroidBuildGradle(version, versionCode) {
  const buildGradlePath = path.join(__dirname, "..", "android", "app", "build.gradle");
  if (!fs.existsSync(buildGradlePath)) {
    return;
  }

  let contents = fs.readFileSync(buildGradlePath, "utf8");
  contents = contents.replace(/versionCode \d+/, `versionCode ${versionCode}`);
  contents = contents.replace(/versionName "[^"]*"/, `versionName "${version}"`);
  fs.writeFileSync(buildGradlePath, contents);
}

if (require.main === module) {
  bumpVersion();
}

module.exports = bumpVersion;
