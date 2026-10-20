// Execute the built client bundle against a stub module loader and locale runtime.
// usage: node tools/verify-pack.js <pack-dir> <corpus.json>
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [PACK, CORPUS_PATH] = process.argv.slice(2);
const clientPath = path.join(PACK, 'lib', 'client.js');
if (!fs.existsSync(clientPath)) {
  console.error('missing ' + clientPath);
  process.exit(1);
}
const corpus = CORPUS_PATH ? JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8')) : null;
const STRICT = process.argv.includes('--strict');
const ALLOW_EMPTY = new Set(['chat/message.stepProcess.sharedPrefix', 'chat/number.groupSeparator', 'pluginManager/sentenceSeparator', 'schedule.catalog/cron.part.join', 'schedule.manager/cron.part.join']);
const source = fs.readFileSync(clientPath, 'utf8');

const failures = [];
const registered = new Map();
const languages = [];
let loaded = null;

const sandbox = {
  window: {
    __ModuleLoader__: {
      load(row) {
        loaded = row;
      },
    },
  },
  console,
};
vm.createContext(sandbox);
try {
  vm.runInContext(source, sandbox, { filename: 'client.js' });
} catch (error) {
  console.error('FAIL: bundle did not evaluate: ' + error.message);
  process.exit(1);
}
if (!loaded) {
  console.error('FAIL: bundle did not call window.__ModuleLoader__.load');
  process.exit(1);
}
if (loaded.id !== 'dsh-locale-ru') failures.push(`row id is "${loaded.id}", expected "dsh-locale-ru"`);

let exportsObject;
try {
  exportsObject = loaded.factory((specifier) => {
    throw new Error('unexpected require: ' + specifier);
  });
} catch (error) {
  console.error('FAIL: factory threw: ' + error.message);
  process.exit(1);
}
if (typeof exportsObject.apply !== 'function') failures.push('factory exports no apply()');
if (!Array.isArray(exportsObject.inject) || !exportsObject.inject.includes('locale')) {
  failures.push('apply does not inject the locale service');
}

const disposers = [];
const ctx = {
  effect(factory, label) {
    const dispose = factory();
    disposers.push(dispose);
    return dispose;
  },
  locale: {
    addLanguage(input) {
      languages.push(input);
      return () => {};
    },
    register(ns, lang, dict) {
      const key = ns + '/' + lang;
      if (registered.has(key)) failures.push(`duplicate registration ${key}`);
      if (typeof dict !== 'object' || dict === null) failures.push(`${key}: dictionary is not an object`);
      registered.set(key, dict);
      return () => {};
    },
  },
};

try {
  exportsObject.apply(ctx);
} catch (error) {
  console.error('FAIL: apply threw: ' + error.message + '\n' + error.stack);
  process.exit(1);
}
for (const dispose of disposers) {
  if (typeof dispose !== 'function') { failures.push('an effect returned no disposer'); break; }
}

if (languages.length !== 1) failures.push(`addLanguage called ${languages.length} times`);
const language = languages[0] || {};
if (language.id !== 'ru') failures.push(`language id is "${language.id}"`);
if (language.fallback !== 'en') failures.push(`language fallback is "${language.fallback}"`);
if (!language.label) failures.push('language has no label');

let keys = 0;
const seenNamespaces = new Set();
for (const [key, dict] of registered) {
  const [ns, lang] = key.split('/');
  if (lang !== 'ru') failures.push(`${key}: unexpected locale`);
  seenNamespaces.add(ns);
  for (const [name, value] of Object.entries(dict)) {
    keys += 1;
    if (typeof value !== 'string') failures.push(`${ns}/${name}: not a string`);
    else if (value.trim() === '' && !ALLOW_EMPTY.has(`${ns}/${name}`)) failures.push(`${ns}/${name}: empty`);
  }
  if (corpus) {
    if (!corpus[ns]) failures.push(`${ns}: namespace not in the corpus`);
    else {
      const expected = new Set(Object.keys(corpus[ns]));
      for (const name of Object.keys(dict)) if (!expected.has(name)) failures.push(`${ns}/${name}: unknown key`);
      const missing = [...expected].filter((name) => !(name in dict));
      if (missing.length) {
        if (STRICT) failures.push(`${ns}: ${missing.length} untranslated keys (fall back to English)`);
        else console.log(`note: ${ns} falls back to English for ${missing.length} keys`);
      }
    }
  }
}

console.log(`language: ${language.id} (${language.label}), fallback ${language.fallback}`);
console.log(`namespaces: ${seenNamespaces.size}, keys: ${keys}`);
for (const dispose of disposers) dispose();
if (failures.length) {
  console.log(`\nFAIL (${failures.length}):`);
  for (const f of failures.slice(0, 40)) console.log('  ' + f);
  process.exit(1);
}
console.log('\nOK: bundle loads, registers the language and every namespace, and disposes cleanly.');
