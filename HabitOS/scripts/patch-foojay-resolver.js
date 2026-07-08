// @react-native/gradle-plugin pins org.gradle.toolchains.foojay-resolver-convention to 0.5.0,
// which crashes under Gradle 9.x with:
//   NoSuchFieldError: JvmVendorSpec does not have member field 'IBM_SEMERU'
// Bumping it to a release built against Gradle 9's API fixes it. Runs on postinstall since
// npm install / expo prebuild rewrite node_modules and would silently undo this.
const fs = require("node:fs");
const path = require("node:path");

const TARGET_FILE = path.join(
  __dirname,
  "..",
  "node_modules",
  "@react-native",
  "gradle-plugin",
  "settings.gradle.kts",
);
const OLD_VERSION = 'id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")';
const NEW_VERSION = 'id("org.gradle.toolchains.foojay-resolver-convention").version("0.9.0")';

if (!fs.existsSync(TARGET_FILE)) {
  process.exit(0);
}

const contents = fs.readFileSync(TARGET_FILE, "utf8");
if (contents.includes(OLD_VERSION)) {
  fs.writeFileSync(TARGET_FILE, contents.replace(OLD_VERSION, NEW_VERSION));
  console.log("[patch-foojay-resolver] foojay-resolver-convention bumped to 0.9.0 for Gradle 9 compatibility.");
}
