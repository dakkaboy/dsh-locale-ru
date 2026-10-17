// Extract locale dictionaries (zh/en) from every client bundle inside app.asar,
// by resolving each `locale.register(...)` call site to its namespace and literals.
const fs = require('fs');
const path = require('path');

const ASAR = process.argv[2];
const OUT = process.argv[3];

function readHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, 0);
  const headerSize = sizeBuf.readUInt32LE(4);
  const headerBuf = Buffer.alloc(headerSize);
  fs.readSync(fd, headerBuf, 0, headerSize, 8);
  const stringSize = headerBuf.readUInt32LE(4);
  const json = headerBuf.toString('utf8', 8, 8 + stringSize);
  fs.closeSync(fd);
  return { header: JSON.parse(json), dataOffset: 8 + headerSize };
}
function walk(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (entry.files) walk(entry, p, out);
    else out.push({ path: p, size: entry.size, offset: Number(entry.offset), unpacked: !!entry.unpacked });
  }
}
function findBalanced(src, openIndex) {
  const open = src[openIndex];
  const close = open === '(' ? ')' : open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return { text: src.slice(openIndex, i + 1), end: i + 1 };
    }
  }
  return null;
}
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(last, i).trim());
      last = i + 1;
    }
  }
  const tail = text.slice(last).trim();
  if (tail) parts.push(tail);
  return parts;
}
const scopeCache = new Map();
function buildScope(src) {
  if (scopeCache.has(src)) return scopeCache.get(src);
  const scope = Object.create(null);
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])((?:\\.|(?!\2)[\s\S])*)\2/g;
  let m;
  while ((m = re.exec(src))) scope[m[1]] = m[3];
  scopeCache.set(src, scope);
  return scope;
}
function evalLiteral(text, src) {
  try {
    const scope = buildScope(src || '');
    const proxy = new Proxy(scope, {
      has: () => true,
      get: (target, key) => (key === Symbol.unscopables ? undefined : target[key]),
    });
    // eslint-disable-next-line no-new-func
    const fn = new Function('__scope', 'with (__scope) { return (' + text + '); }');
    return fn(proxy);
  } catch { return undefined; }
}
function declLiteral(src, ident) {
  const re = new RegExp('(?:const|let|var)\\s+' + ident.replace(/\$/g, '\\$') + '\\s*=\\s*\\{', 'g');
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const lit = findBalanced(src, src.indexOf('{', m.index));
    if (lit) out.push({ index: m.index, value: evalLiteral(lit.text, src) });
  }
  return out;
}
function declString(src, ident) {
  const re = new RegExp('(?:const|let|var)\\s+' + ident.replace(/\$/g, '\\$') + '\\s*=\\s*(["\'])([^"\']*)\\1', 'g');
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ index: m.index, value: m[2] });
  return out;
}
function nearest(list, index) {
  const before = list.filter((d) => d.index <= index);
  return (before.length ? before[before.length - 1] : list[0]) || null;
}
// Resolve an expression that should yield a string.
function resolveString(src, expr, at) {
  expr = expr.trim();
  const q = /^(["'])([\s\S]*)\1$/.exec(expr);
  if (q) return q[2];
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const hit = nearest(declString(src, expr), at);
    if (hit) return hit.value;
  }
  return null;
}
// Resolve an expression that should yield an object literal.
function resolveObject(src, expr, at) {
  expr = expr.trim();
  if (expr.startsWith('{')) {
    const lit = findBalanced(expr, 0);
    return lit ? evalLiteral(lit.text, src) : undefined;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const hit = nearest(declLiteral(src, expr).filter((d) => d.value && typeof d.value === 'object'), at);
    return hit ? hit.value : undefined;
  }
  return undefined;
}
// Read `{ key: valueExpr, ... }` into a property map of raw expression text.
function readProps(text) {
  const inner = text.slice(1, -1);
  const props = {};
  for (const part of splitTopLevel(inner)) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/.exec(part);
    if (m) props[m[1]] = m[2].trim();
    else if (/^[A-Za-z_$][\w$]*$/.test(part.trim())) props[part.trim()] = part.trim();
  }
  return props;
}

const { header, dataOffset } = readHeader(ASAR);
const entries = [];
walk(header, '', entries);
const fd = fs.openSync(ASAR, 'r');
const candidates = entries.filter((e) => /\/lib\/client[^/]*\.js$/.test(e.path) && !e.unpacked);

const results = [];
const failures = [];
let totalKeys = 0;
for (const e of candidates) {
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, dataOffset + e.offset);
  const src = buf.toString('utf8');
  const pkg = e.path.split('/node_modules/').pop().replace(/\/lib\/.*$/, '');
  const dicts = [];
  const re = /locale\.register\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf('(', m.index);
    const call = findBalanced(src, open);
    if (!call) continue;
    const args = splitTopLevel(call.text.slice(1, -1));
    if (args.length < 2) continue;
    const ns = resolveString(src, args[0], m.index);
    // Form A: register(ns, { zh, en }); Form B: register(ns, 'ja', dict)
    let zh; let en;
    if (args.length >= 3) {
      const lang = resolveString(src, args[1], m.index);
      const obj = resolveObject(src, args[2], m.index);
      if (!lang || !obj) { failures.push({ pkg, ns, why: 'formB ' + args[0] + ' / ' + args[1] }); continue; }
      if (lang === 'zh') zh = obj;
      else if (lang === 'en') en = obj;
      else continue;
    } else {
      if (!args[1].trim().startsWith('{')) { failures.push({ pkg, ns, why: 'args ' + args[1].slice(0, 40) }); continue; }
      const props = readProps(findBalanced(args[1], 0).text);
      if (props.zh) zh = resolveObject(src, props.zh, m.index);
      if (props.en) en = resolveObject(src, props.en, m.index);
    }
    const isDict = (o) => o && typeof o === 'object' && Object.keys(o).length > 0
      && Object.values(o).every((v) => typeof v === 'string');
    if (!isDict(zh) && !isDict(en)) { failures.push({ pkg, ns, why: 'nodict' }); continue; }
    const keys = Object.keys(zh || en);
    dicts.push({ ns, zh: isDict(zh) ? zh : null, en: isDict(en) ? en : null, keys: keys.length });
    totalKeys += keys.length;
  }
  if (dicts.length) results.push({ package: pkg, dicts });
  // Fallback: `const dictionaries = [['zh', {...}], ['en', {...}]]` array form.
  if (!dicts.length) {
    const reArr = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
    let a;
    while ((a = reArr.exec(src))) {
      const lit = findBalanced(src, src.indexOf('[', a.index));
      if (!lit) continue;
      const arr = evalLiteral(lit.text, src);
      if (!Array.isArray(arr) || !arr.length) continue;
      const pairs = arr.filter((x) => Array.isArray(x) && typeof x[0] === 'string' && x[1] && typeof x[1] === 'object');
      if (pairs.length < 2) continue;
      const ns = resolveString(src, 'LOCALE_NS', a.index) || resolveString(src, 'NS', a.index) || null;
      const entry = { ns, zh: null, en: null, keys: 0 };
      for (const [lang, dict] of pairs) {
        if (lang === 'zh') entry.zh = dict;
        else if (lang === 'en') entry.en = dict;
      }
      const keyList = Object.keys(entry.zh || entry.en || {});
      entry.keys = keyList.length;
      if (!entry.keys) continue;
      dicts.push(entry);
      totalKeys += entry.keys;
      break;
    }
    if (dicts.length) results.push({ package: pkg, dicts });
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const r of results) {
  fs.writeFileSync(path.join(OUT, r.package.replace(/[/@]/g, '_') + '.json'), JSON.stringify(r, null, 2));
  console.log(`${r.package}\t${r.dicts.map((d) => `${d.ns}(${d.keys}${d.en ? '' : ',zh-only'}${d.zh ? '' : ',en-only'})`).join(' ')}`);
}
if (failures.length) console.log('FAILURES:\n' + failures.map((f) => f.pkg + ' ' + (f.ns ?? '?') + ' ' + f.why).join('\n'));
console.log(`\npackages=${results.length} keys=${totalKeys}`);
