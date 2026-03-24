import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPTS_DIR = __dirname;
const PROJECT_ROOT = resolve(SCRIPTS_DIR, "..");
const MONOREPO_ROOT = resolve(PROJECT_ROOT, "..", "..", "primitiv");
const PRIMITIV_PACKAGES_PATH = resolve(MONOREPO_ROOT, "packages");

const PRIMITIV_PACKAGES = existsSync(PRIMITIV_PACKAGES_PATH)
  ? readdirSync(PRIMITIV_PACKAGES_PATH).filter((name) =>
      statSync(join(PRIMITIV_PACKAGES_PATH, name)).isDirectory(),
    )
  : [];

const STATE_FILE = join(PROJECT_ROOT, ".primitiv-link-state.json");
const PACKAGE_JSON_PATH = join(PROJECT_ROOT, "package.json");

function log(msg) {
  console.log(`[primitiv-link] ${msg}`);
}

function error(msg) {
  console.error(`[primitiv-link] ❌ ${msg}`);
}

function success(msg) {
  console.log(`[primitiv-link] ✅ ${msg}`);
}

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { mode: "npm", backup: null };
  }

  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { mode: "npm", backup: null };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function readPackageJson() {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
}

function writePackageJson(content) {
  writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(content, null, 2) + "\n");
}

function getLocalPath(packageName) {
  const absolutePath = join(PRIMITIV_PACKAGES_PATH, packageName);
  return `file:${absolutePath.replace(/\\/g, "/")}`;
}

function cleanCaches() {
  log("🗑️  Cleaning caches...");

  const primitivDir = join(PROJECT_ROOT, "node_modules", "@primitiv");
  if (existsSync(primitivDir)) {
    rmSync(primitivDir, { recursive: true, force: true });
    log("  ✓ Deleted node_modules/@primitiv");
  }

  const pnpmStore = join(PROJECT_ROOT, "node_modules", ".pnpm");
  if (existsSync(pnpmStore)) {
    rmSync(pnpmStore, { recursive: true, force: true });
    log("  ✓ Deleted node_modules/.pnpm");
  }

  success("Caches cleared!");
}

function runInstall() {
  log("📦 Running pnpm install...");
  try {
    execSync("pnpm install", { cwd: PROJECT_ROOT, stdio: "inherit" });
  } catch {
    error("Install failed");
    process.exit(1);
  }
}

function cmdLink() {
  log("🔗 Switching applications to LOCAL @primitiv packages...");

  if (!existsSync(PRIMITIV_PACKAGES_PATH)) {
    error(`Packages directory not found at: ${PRIMITIV_PACKAGES_PATH}`);
    process.exit(1);
  }

  const state = loadState();
  const pkg = readPackageJson();

  if (!state.backup) {
    state.backup = pkg;
  }

  if (!pkg.pnpm) pkg.pnpm = {};
  if (!pkg.pnpm.overrides) pkg.pnpm.overrides = {};

  for (const packageName of PRIMITIV_PACKAGES) {
    pkg.pnpm.overrides[`@primitiv/${packageName}`] = getLocalPath(packageName);
  }

  writePackageJson(pkg);

  state.mode = "link";
  state.linkedAt = new Date().toISOString();
  saveState(state);

  cleanCaches();
  runInstall();
  success("Applications now use local packages.");
}

function cmdUnlink() {
  log("📦 Switching applications back to NPM packages...");

  const state = loadState();
  if (state.mode !== "link" || !state.backup) {
    log("Already using NPM packages.");
    return;
  }

  writePackageJson(state.backup);
  saveState({ mode: "npm", backup: null });

  cleanCaches();
  runInstall();
  success("Applications now use NPM packages.");
}

function cmdStatus() {
  const state = loadState();
  const pkg = readPackageJson();
  const overrides = pkg.pnpm?.overrides ?? {};

  console.log(`Current Mode: ${state.mode === "link" ? "🔗 LOCAL" : "📦 NPM"}`);
  console.log(`Monorepo: ${PRIMITIV_PACKAGES_PATH}`);

  for (const [name, value] of Object.entries(overrides)) {
    if (!name.startsWith("@primitiv/")) continue;
    console.log(`  🔗 ${name}: ${value}`);
  }
}

function cmdRefresh() {
  cleanCaches();
  runInstall();
  success("Refresh complete!");
}

const command = process.argv[2];
switch (command) {
  case "link":
    cmdLink();
    break;
  case "unlink":
    cmdUnlink();
    break;
  case "status":
    cmdStatus();
    break;
  case "refresh":
    cmdRefresh();
    break;
  default:
    console.log(
      "Usage: node scripts/primitiv-link.js [link|unlink|status|refresh]",
    );
}
