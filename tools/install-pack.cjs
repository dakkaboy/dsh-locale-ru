// Install (or remove) the Russian language pack in the DSH desktop profile.
// usage: node tools/install-pack.js <pack-dir> [--remove]
const fs = require('fs');
const path = require('path');
const os = require('os');

const PACK_SRC = process.argv[2];
const REMOVE = process.argv.includes('--remove');
if (!PACK_SRC) {
  console.error('usage: node tools/install-pack.js <pack-dir> [--remove]');
  process.exit(2);
}

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROFILE = process.env.DSH_PROFILE || 'desktop';
const PROFILE_DIR = path.join(HOME, 'profiles', PROFILE);
const PLUGIN_DIR = path.join(PROFILE_DIR, 'plugins', 'dsh-locale-ru');
const LINK_DIR = path.join(PROFILE_DIR, 'node_modules', 'dsh-locale-ru');
const PKG_PATH = path.join(PROFILE_DIR, 'package.json');
const PATCH_PATH = path.join(PROFILE_DIR, 'cordis.patch.yml');
const ENTRY_ID = 'locale-ru';
const ENTRY_NAME = 'dsh-locale-ru';

for (const required of [PROFILE_DIR, PKG_PATH, PATCH_PATH]) {
  if (!fs.existsSync(required)) {
    console.error('missing ' + required);
    process.exit(1);
  }
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function linkIsCurrent(target) {
  try {
    const stat = fs.lstatSync(LINK_DIR);
    if (!stat.isSymbolicLink()) return false;
    return path.resolve(fs.readlinkSync(LINK_DIR)) === path.resolve(target);
  } catch {
    return false;
  }
}

function updatePackageJson(add) {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  pkg.dependencies = pkg.dependencies || {};
  if (add) pkg.dependencies[ENTRY_NAME] = `file:./plugins/dsh-locale-ru`;
  else delete pkg.dependencies[ENTRY_NAME];
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

function updatePatch(add) {
  const original = fs.readFileSync(PATCH_PATH, 'utf8');
  const block = `# Russian interface (dsh-locale-ru)\n- insert:\n    - id: ${ENTRY_ID}\n      name: ${ENTRY_NAME}\n`;
  const has = original.includes(`# Russian interface (dsh-locale-ru)`);
  if (add && !has) {
    const body = original.endsWith('\n') || original === '' ? original : original + '\n';
    fs.writeFileSync(PATCH_PATH, body + block);
  } else if (!add && has) {
    const start = original.indexOf('# Russian interface (dsh-locale-ru)');
    const rest = original.slice(start);
    const end = rest.search(/\n(?=- )|\n#[^\n]*\n- /);
    const tail = end === -1 ? '' : rest.slice(end + 1);
    fs.writeFileSync(PATCH_PATH, original.slice(0, start) + tail);
  }
}

if (REMOVE) {
  updatePatch(false);
  updatePackageJson(false);
  if (fs.existsSync(LINK_DIR)) fs.rmSync(LINK_DIR, { recursive: true, force: true });
  if (fs.existsSync(PLUGIN_DIR)) fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  console.log('removed dsh-locale-ru from ' + PROFILE_DIR);
  process.exit(0);
}

if (!fs.existsSync(path.join(PACK_SRC, 'lib', 'client.js'))) {
  console.error('pack has no lib/client.js: ' + PACK_SRC);
  process.exit(1);
}
copyDir(PACK_SRC, PLUGIN_DIR);
fs.mkdirSync(path.dirname(LINK_DIR), { recursive: true });
if (!linkIsCurrent(PLUGIN_DIR)) {
  if (fs.existsSync(LINK_DIR)) fs.rmSync(LINK_DIR, { recursive: true, force: true });
  fs.symlinkSync(PLUGIN_DIR, LINK_DIR, 'junction');
}
updatePatch(true);
updatePackageJson(true);

const resolved = fs.realpathSync(LINK_DIR);
console.log('plugin:  ' + PLUGIN_DIR);
console.log('linked:  ' + LINK_DIR + ' -> ' + resolved);
console.log('patch:   ' + PATCH_PATH + ' (+' + ENTRY_ID + ')');
console.log('profile: ' + PKG_PATH + ' (dependency dsh-locale-ru)');
