// Split the merged locale corpus into per-agent translation batches.
const fs = require('fs');
const path = require('path');

const CORPUS = process.argv[2];
const OUT = process.argv[3];
const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));

/** Ordered groups; a namespace may be split by a `{ ns, slice: [start, end] }` entry. */
const GROUPS = [
  ['common', 'settings.locale', 'shortcuts', 'shortcuts.layout'],
  ['settings', 'settings.account', 'settings.theme'],
  ['settings.models', 'settings.webSearch', 'settings.agentLoop', 'settings.subagent'],
  ['pluginMarket', 'settings.plugins', 'settings.pluginInventory', 'settings.shell', 'settings.sessionLog', 'settings.agentPreset', 'settings.permission'],
  ['pluginManager'],
  [{ ns: 'conversation', slice: [0, 0.5] }],
  [{ ns: 'conversation', slice: [0.5, 1] }],
  ['chat'],
  ['trajectory'],
  ['workspace', 'sidebar', 'sidebarFiles', 'sidebarBrowser'],
  ['sidebarRight', 'sidebarTerminal', 'sidebarDocumentPreview', 'documentMarkdown', 'documentHtml', 'sidebarCodePreview', 'sidebarOffice', 'sidebarExcel', 'sidebarImage', 'sidebarPdf', 'directory-browser'],
  ['schedule.manager', 'schedule.catalog', 'job'],
  ['voice-input', 'cotTranslation', 'agent-team'],
  ['deliverables', 'plan', 'reference', 'skill', 'subagent', 'workflowRun', 'inspectorPanel', 'session-inspector', 'session-log-download'],
  ['cordis', 'command', 'slash.menu', 'question', 'feedback', 'permission.access', 'open-in-app', 'secretMask', 'deepseek-model-label-1017', 'approval', 'goal', 'model'],
];

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
let total = 0;
GROUPS.forEach((group, index) => {
  const id = `G${String(index + 1).padStart(2, '0')}`;
  const batch = {};
  for (const entry of group) {
    const ns = typeof entry === 'string' ? entry : entry.ns;
    const source = corpus[ns];
    if (!source) throw new Error(`missing namespace ${ns}`);
    const keys = Object.keys(source);
    const slice = typeof entry === 'string' ? null : entry.slice;
    const chosen = slice ? keys.slice(Math.floor(keys.length * slice[0]), Math.floor(keys.length * slice[1])) : keys;
    batch[ns] = batch[ns] || {};
    for (const key of chosen) {
      const value = source[key];
      // Every value must be a translatable English string; Chinese-only keys carry a marker.
      batch[ns][key] = value.en ?? `[zh] ${value.zh}`;
      total += 1;
    }
  }
  const count = Object.values(batch).reduce((sum, dict) => sum + Object.keys(dict).length, 0);
  const file = path.join(OUT, `batch-${id}.json`);
  fs.writeFileSync(file, JSON.stringify(batch, null, 2) + '\n');
  manifest.push({ id, file: `translate/batch-${id}.json`, output: `translate/ru-${id}.json`, count, namespaces: Object.keys(batch) });
  console.log(`${id}  ${String(count).padStart(4)}  ${Object.keys(batch).join(', ')}`);
});
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nbatches=${manifest.length} keys=${total}`);
