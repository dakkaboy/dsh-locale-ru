// Validate one translated batch against its source batch.
// usage: node tools/check-partial.js translate/batch-G01.json translate/ru-G01.json
const fs = require('fs');

const [srcPath, outPath] = process.argv.slice(2);
if (!srcPath || !outPath) {
  console.error('usage: node tools/check-partial.js <source.json> <output.json>');
  process.exit(2);
}
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
let out;
try {
  out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
} catch (error) {
  console.error(`FAIL: ${outPath} is not valid JSON: ${error.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const CYRILLIC = /[А-Яа-яЁё]/;
const LATIN_WORD = /[A-Za-z]{2,}/;
// Values that legitimately stay as in English: brands, formats, symbols, shortcuts.
const KEEP = /^(OK|API|JSON|Markdown|DeepSeek|DSH|Harness|GitHub|MCP|VS Code|Windows|macOS|Linux|PDF|Excel|Word|PowerPoint|CSV|HTML|CSS|YAML|CLI|IDE|URL|URI|HTTP|HTTPS|ID|SDK|OAuth|Token|Tokens|SenseVoice|LibreOffice|Docker|npm|pnpm|Node\.js|Python|Bash|PowerShell|Terminal|Chat|Web|Codex|Anthropic|OpenAI|Google|Gemini|Kimi|Qwen|GLM|MiniMax|Moonshot|Zhipu|K2|R1|V4|Pro|Flash|Max|Mini|Plus|Team|Beta|Alpha)$/;

for (const ns of Object.keys(src)) {
  if (!(ns in out)) {
    errors.push(`missing namespace "${ns}"`);
    continue;
  }
  for (const key of Object.keys(src[ns])) {
    const source = src[ns][key];
    if (!(key in out[ns])) {
      errors.push(`${ns}/${key}: missing`);
      continue;
    }
    const value = out[ns][key];
    if (typeof value !== 'string') {
      errors.push(`${ns}/${key}: not a string`);
      continue;
    }
    if (value.trim() === '') errors.push(`${ns}/${key}: empty`);
    const a = placeholders(source);
    const b = placeholders(value);
    if (a.join(',') !== b.join(',')) {
      errors.push(`${ns}/${key}: placeholders {${a.join('}{')}} -> {${b.join('}{')}}`);
    }
    if (/^\s/.test(source) !== /^\s/.test(value) || /\s$/.test(source) !== /\s$/.test(value)) {
      warnings.push(`${ns}/${key}: leading/trailing whitespace changed`);
    }
    if (source === value && LATIN_WORD.test(source) && !KEEP.test(source.trim())) {
      warnings.push(`${ns}/${key}: unchanged "${source}"`);
    }
    if (!CYRILLIC.test(value) && LATIN_WORD.test(value) && /[A-Za-z]{3,}/.test(value) && !KEEP.test(value.trim())) {
      warnings.push(`${ns}/${key}: no Cyrillic "${value}"`);
    }
  }
  for (const key of Object.keys(out[ns])) {
    if (!(key in src[ns])) errors.push(`${ns}/${key}: extra key`);
  }
}
for (const ns of Object.keys(out)) {
  if (!(ns in src)) errors.push(`extra namespace "${ns}"`);
}

const total = Object.values(src).reduce((sum, dict) => sum + Object.keys(dict).length, 0);
for (const w of warnings.slice(0, 40)) console.log(`warn  ${w}`);
if (warnings.length > 40) console.log(`warn  … ${warnings.length - 40} more warnings`);
for (const e of errors) console.log(`ERROR ${e}`);
if (errors.length) {
  console.log(`\nFAIL ${path(outPath)}: ${errors.length} errors, ${warnings.length} warnings (${total} keys)`);
  process.exit(1);
}
console.log(`OK ${outPath}: ${total} keys, ${warnings.length} warnings`);
