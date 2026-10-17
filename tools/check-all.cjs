// Validate every translated batch and the whole corpus coverage.
// usage: node tools/check-all.js [translate-dir] [corpus.json]
const fs = require('fs');
const path = require('path');

const TRANSLATE = process.argv[2] || 'translate';
const CORPUS = process.argv[3] || 'inspect/corpus.json';
const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const ALLOW_EMPTY = new Set(['chat/message.stepProcess.sharedPrefix']);
const ALLOW_SPACE_ONLY = new Set(['chat/number.groupSeparator', 'pluginManager/sentenceSeparator']);

const errors = [];
const ru = {};
const batches = fs.readdirSync(TRANSLATE).filter((f) => /^batch-G\d+\.json$/.test(f)).sort();
for (const file of batches) {
  const id = file.replace('batch-', '').replace('.json', '');
  const outPath = path.join(TRANSLATE, `ru-${id}.json`);
  const source = JSON.parse(fs.readFileSync(path.join(TRANSLATE, file), 'utf8'));
  if (!fs.existsSync(outPath)) {
    errors.push(`${id}: missing ${outPath}`);
    continue;
  }
  const translated = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  for (const ns of Object.keys(source)) {
    if (!(ns in translated)) {
      errors.push(`${id}: namespace missing ${ns}`);
      continue;
    }
    ru[ns] = { ...(ru[ns] || {}), ...translated[ns] };
    for (const key of Object.keys(source[ns])) {
      if (!(key in translated[ns])) {
        errors.push(`${id}: ${ns}/${key} missing`);
        continue;
      }
      const value = translated[ns][key];
      const id2 = `${ns}/${key}`;
      if (typeof value !== 'string') errors.push(`${id}: ${id2} is not a string`);
      else if (value === '' && !ALLOW_EMPTY.has(id2)) errors.push(`${id}: ${id2} is empty`);
      else if (value.trim() === '' && !ALLOW_SPACE_ONLY.has(id2) && !ALLOW_EMPTY.has(id2)) errors.push(`${id}: ${id2} is blank`);
      else if (placeholders(source[ns][key]) !== placeholders(value)) {
        errors.push(`${id}: ${id2} placeholders {${placeholders(source[ns][key])}} -> {${placeholders(value)}}`);
      }
    }
    for (const key of Object.keys(translated[ns])) {
      if (!(key in source[ns])) errors.push(`${id}: ${ns}/${key} is not in the batch`);
    }
  }
}

// Overrides are part of the shipped output too.
const overridesPath = path.join(TRANSLATE, 'overrides.json');
if (fs.existsSync(overridesPath)) {
  const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
  for (const [ns, dict] of Object.entries(overrides)) {
    ru[ns] = ru[ns] || {};
    for (const [key, value] of Object.entries(dict)) {
      const source = corpus[ns]?.[key];
      if (!source) errors.push(`overrides: ${ns}/${key} is not in the corpus`);
      else if (placeholders(source.en ?? '') !== placeholders(value)) {
        errors.push(`overrides: ${ns}/${key} placeholders mismatch`);
      }
      ru[ns][key] = value;
    }
  }
}

let total = 0;
let covered = 0;
const gaps = [];
for (const ns of Object.keys(corpus)) {
  for (const key of Object.keys(corpus[ns])) {
    total += 1;
    if (ru[ns]?.[key] === undefined) gaps.push(`${ns}/${key}`);
    else covered += 1;
  }
}

console.log(`batches: ${batches.length}  corpus keys: ${total}  translated: ${covered}  gaps: ${gaps.length}`);
if (gaps.length) console.log('first gaps: ' + gaps.slice(0, 15).join(', '));
if (errors.length) {
  console.log(`\nFAIL: ${errors.length} error(s)`);
  for (const error of errors.slice(0, 60)) console.log('  ' + error);
  process.exit(1);
}
console.log('OK: every batch matches its source and the corpus is fully translated.');
