// Merge per-package dictionary dumps into one namespace → key → { en, zh } corpus.
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2];
const OUT = process.argv[3];

const corpus = {};
const conflicts = [];
for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  for (const d of data.dicts) {
    const ns = d.ns || 'UNKNOWN';
    corpus[ns] = corpus[ns] || {};
    const keys = new Set([...Object.keys(d.en || {}), ...Object.keys(d.zh || {})]);
    for (const k of keys) {
      const en = d.en?.[k];
      const zh = d.zh?.[k];
      const prev = corpus[ns][k];
      if (prev) {
        if (en && prev.en && en !== prev.en) conflicts.push({ ns, k, a: prev.en, b: en, pkg: data.package });
        if (!prev.en && en) prev.en = en;
        if (!prev.zh && zh) prev.zh = zh;
        prev.packages = [...new Set([...(prev.packages || []), data.package])];
      } else {
        corpus[ns][k] = { en, zh, packages: [data.package] };
      }
    }
  }
}

const namespaces = Object.keys(corpus).sort();
let total = 0;
let missingEn = 0;
const lines = [];
for (const ns of namespaces) {
  const keys = Object.keys(corpus[ns]);
  total += keys.length;
  const noEn = keys.filter((k) => !corpus[ns][k].en);
  missingEn += noEn.length;
  lines.push(`${ns}\t${keys.length}${noEn.length ? ` (${noEn.length} without en)` : ''}`);
}
fs.writeFileSync(OUT, JSON.stringify(corpus, null, 2));
console.log(lines.join('\n'));
console.log(`\nnamespaces=${namespaces.length} keys=${total} missingEn=${missingEn} conflicts=${conflicts.length}`);
if (conflicts.length) {
  fs.writeFileSync(OUT + '.conflicts.json', JSON.stringify(conflicts, null, 2));
  console.log('sample conflicts:');
  for (const c of conflicts.slice(0, 10)) console.log(`  ${c.ns}/${c.k}: ${JSON.stringify(c.a)} vs ${JSON.stringify(c.b)} (${c.pkg})`);
}
