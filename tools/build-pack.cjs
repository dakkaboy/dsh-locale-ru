// Assemble the Russian language-pack plugin from translated batches.
// usage: node tools/build-pack.js <translate-dir> <corpus.json> <out-dir>
const fs = require('fs');
const path = require('path');

const [TRANSLATE, CORPUS_PATH, OUT] = process.argv.slice(2);
if (!TRANSLATE || !CORPUS_PATH || !OUT) {
  console.error('usage: node tools/build-pack.js <translate-dir> <corpus.json> <out-dir>');
  process.exit(2);
}

const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
const ru = {};
const problems = [];
const files = fs.readdirSync(TRANSLATE).filter((f) => /^ru-G\d+\.json$/.test(f)).sort();
if (!files.length) {
  console.error('no ru-G*.json files found in ' + TRANSLATE);
  process.exit(1);
}
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(TRANSLATE, file), 'utf8'));
  for (const [ns, dict] of Object.entries(data)) {
    if (!corpus[ns]) { problems.push(`${file}: unknown namespace ${ns}`); continue; }
    ru[ns] = ru[ns] || {};
    for (const [key, value] of Object.entries(dict)) {
      if (!(key in corpus[ns])) { problems.push(`${file}: ${ns}/${key} is not in the corpus`); continue; }
      if (typeof value !== 'string' || value.trim() === '') { problems.push(`${file}: ${ns}/${key} is empty`); continue; }
      if (ru[ns][key] !== undefined && ru[ns][key] !== value) problems.push(`${ns}/${key} translated twice`);
      ru[ns][key] = value;
    }
  }
}

// Coverage report against the shipped dictionaries.
const overridesPath = path.join(TRANSLATE, 'overrides.json');
if (fs.existsSync(overridesPath)) {
  const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
  for (const [ns, dict] of Object.entries(overrides)) {
    ru[ns] = ru[ns] || {};
    for (const [key, value] of Object.entries(dict)) ru[ns][key] = value;
  }
  console.log('applied overrides from ' + overridesPath);
}
const rewritesPath = path.join(TRANSLATE, 'rewrites.json');
if (fs.existsSync(rewritesPath)) {
  const rewrites = JSON.parse(fs.readFileSync(rewritesPath, 'utf8'));
  let hits = 0;
  for (const [ns, dict] of Object.entries(ru)) {
    for (const [key, value] of Object.entries(dict)) {
      let next = value;
      for (const { from, to } of rewrites) next = next.split(from).join(to);
      if (next !== value) {
        dict[key] = next;
        hits += 1;
      }
    }
  }
  console.log(`applied ${hits} rewrite(s) from ${rewritesPath}`);
}
const ALLOW_EMPTY = new Set(['chat/message.stepProcess.sharedPrefix']);
const ALLOW_SPACE_ONLY = new Set(['chat/number.groupSeparator', 'pluginManager/sentenceSeparator']);
for (const ns of Object.keys(ru)) {
  for (const [key, value] of Object.entries(ru[ns])) {
    const id = `${ns}/${key}`;
    if (typeof value !== 'string') problems.push(`${id}: not a string`);
    else if (value === '' && !ALLOW_EMPTY.has(id)) problems.push(`${id}: empty`);
    else if (value.trim() === '' && !ALLOW_SPACE_ONLY.has(id) && !ALLOW_EMPTY.has(id)) problems.push(`${id}: blank`);
  }
}

let translated = 0;
let untranslated = 0;
const gaps = [];
for (const ns of Object.keys(corpus)) {
  for (const key of Object.keys(corpus[ns])) {
    if (ru[ns]?.[key] !== undefined) translated += 1;
    else { untranslated += 1; gaps.push(`${ns}/${key}`); }
  }
}
const namespaces = Object.keys(ru).sort();
for (const ns of namespaces) {
  const dict = ru[ns];
  for (const key of Object.keys(dict)) {
    const source = corpus[ns][key];
    if (!source) continue;
    const want = (source.en ?? '').match(/\{\w+\}/g)?.sort().join(',') ?? '';
    const got = dict[key].match(/\{\w+\}/g)?.sort().join(',') ?? '';
    if (want !== got) problems.push(`${ns}/${key}: placeholder mismatch (${want} vs ${got})`);
  }
}

const pkg = {
  name: 'dsh-locale-ru',
  version: process.argv[5] || '1.0.0',
  description: 'Русская локализация веб-интерфейса DeepSeek Harness: 2737 строк в 64 разделах',
  keywords: ['deepseek', 'dsh', 'localization', 'i18n', 'russian', 'locale', 'plugin'],
  license: 'MIT',
  repository: { type: 'git', url: 'git+https://github.com/dakkaboy/dsh-locale-ru.git' },
  homepage: 'https://github.com/dakkaboy/dsh-locale-ru#readme',
  bugs: { url: 'https://github.com/dakkaboy/dsh-locale-ru/issues' },
  type: 'module',
  main: 'lib/index.js',
  exports: {
    '.': './lib/index.js',
    './client': './lib/client.js',
    './cordis.patch.yml': './cordis.patch.yml',
    './package.json': './package.json',
  },
  dsh: {
    bundle: {
      patch: './cordis.patch.yml',
    },
    client: {
      platform: 'web',
      immediately: true,
      inject: ['@deepseek-ai/dsh-client-locale'],
    },
  },
  files: ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'README.md', 'LICENSE'],
};

const bundlePatch = `# Русская локализация интерфейса DeepSeek Harness: один слой-патч, монтирующий
# клиентский плагин dsh-locale-ru (язык «Русский» и словари всех разделов UI).
- insert:
    - id: locale-ru
      name: dsh-locale-ru
`;

const indexJs = `/** Node half of the Russian locale pack: it contributes no host service of its own. */
export const inject = []

/** Mount the host-side plugin; the browser half registers the language and its dictionaries. */
export function apply() {}
`;

const clientJs = `window.__ModuleLoader__.load({
	id: "dsh-locale-ru",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		/** Russian dictionaries keyed by locale namespace; missing keys fall back to English. */
		const RU = ${JSON.stringify(ru, null, '\t').replace(/\n/g, '\n\t\t')};
		const inject = ["locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" }), "dsh-locale-ru: language");
			for (const ns of Object.keys(RU)) {
				ctx.effect(() => ctx.locale.register(ns, "ru", RU[ns]), "dsh-locale-ru: " + ns + " dictionary");
			}
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
`;

fs.mkdirSync(path.join(OUT, 'lib'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'lib', 'index.js'), indexJs);
fs.writeFileSync(path.join(OUT, 'lib', 'client.js'), clientJs);
fs.writeFileSync(path.join(OUT, 'cordis.patch.yml'), bundlePatch);

console.log(`packages: ${namespaces.length}  translated: ${translated}  fallback-to-en: ${untranslated}`);
if (gaps.length) console.log('first gaps: ' + gaps.slice(0, 20).join(', ') + (gaps.length > 20 ? ' …' : ''));
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems.slice(0, 40)) console.log('  ' + p);
}
console.log(`\nwrote ${path.join(OUT, 'lib', 'client.js')} (${(clientJs.length / 1024).toFixed(1)} KiB)`);
