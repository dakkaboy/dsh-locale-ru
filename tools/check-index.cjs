// Structural check for the plugin market index: format rules and version sync with package.json.
// usage: node tools/check-index.cjs [docs/index.json]
const fs = require('fs');
const path = require('path');

const INDEX = process.argv[2] || 'docs/index.json';
const PKG = process.argv[3] || 'package.json';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const COMMIT = /^[0-9a-f]{40}$/;

const errors = [];
const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));

if (index.format !== 1) errors.push('$.format must be 1');
if (!index.title || typeof index.title.en !== 'string' || index.title.en.trim() === '') {
  errors.push('$.title must carry a non-empty en string');
}
if (!Array.isArray(index.plugins) || index.plugins.length === 0) errors.push('$.plugins must be a non-empty array');

const seen = new Set();
for (const [i, plugin] of (index.plugins || []).entries()) {
  const at = `$.plugins[${i}]`;
  if (typeof plugin.name !== 'string' || !PACKAGE_NAME.test(plugin.name)) errors.push(`${at}.name must be a valid npm name`);
  if (seen.has(plugin.name)) errors.push(`${at}.name duplicates ${plugin.name}`);
  seen.add(plugin.name);
  if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
    errors.push(`${at}.versions must be a non-empty array`);
    continue;
  }
  const versions = new Set();
  for (const [j, version] of plugin.versions.entries()) {
    const vat = `${at}.versions[${j}]`;
    if (typeof version.version !== 'string' || !SEMVER.test(version.version)) errors.push(`${vat}.version must be an exact SemVer`);
    if (versions.has(version.version)) errors.push(`${vat}.version duplicates ${version.version}`);
    versions.add(version.version);
    if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0) {
      errors.push(`${vat}.publishTimestamp must be a non-negative integer (Unix seconds)`);
    }
    const source = version.source || {};
    if (source.type === 'npm') {
      // name@version installs from the registry; nothing else to pin.
    } else if (source.type === 'git') {
      if (typeof source.url !== 'string' || !source.url.startsWith('https://')) errors.push(`${vat}.source.url must be an https URL`);
      if (!COMMIT.test(source.commit || '')) errors.push(`${vat}.source.commit must be a lowercase 40-hex commit`);
      if (source.path !== undefined && (source.path.startsWith('/') || source.path.split('/').includes('..'))) {
        errors.push(`${vat}.source.path must be a relative directory`);
      }
    } else {
      errors.push(`${vat}.source.type must be "npm" or "git"`);
    }
  }
}

const own = (index.plugins || []).find((plugin) => plugin.name === pkg.name);
if (!own) {
  errors.push(`index lists no entry for package "${pkg.name}"`);
} else {
  const listed = (own.versions || []).map((version) => version.version);
  if (!listed.includes(pkg.version)) errors.push(`index has no version ${pkg.version} for "${pkg.name}" (package.json)`);
}

if (errors.length) {
  console.log(`FAIL ${path.basename(INDEX)} (${errors.length}):`);
  for (const error of errors) console.log('  ' + error);
  process.exit(1);
}
console.log(`OK ${INDEX}: format 1, ${index.plugins.length} plugin(s), ${pkg.name}@${pkg.version} listed.`);
