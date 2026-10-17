// Scan every client bundle for locale registration sites and namespace declarations.
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

const { header, dataOffset } = readHeader(ASAR);
const entries = [];
walk(header, '', entries);
const fd = fs.openSync(ASAR, 'r');
const candidates = entries.filter((e) => /\/lib\/client[^/]*\.js$/.test(e.path) && !e.unpacked);
const lines = [];
for (const e of candidates) {
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, dataOffset + e.offset);
  const src = buf.toString('utf8');
  const pkg = e.path.split('/node_modules/').pop().replace(/\/lib\/.*$/, '');
  const report = [];
  let m;
  const reRegister = /locale\.register\(([^)]{0,80})/g;
  while ((m = reRegister.exec(src))) report.push('register(' + m[1].replace(/\s+/g, ' '));
  const reBind = /locale\.bind\(([^)]{0,60})/g;
  while ((m = reBind.exec(src))) report.push('bind(' + m[1].replace(/\s+/g, ' '));
  const reAdd = /addLanguage\(([^)]{0,120})/g;
  while ((m = reAdd.exec(src))) report.push('addLanguage(' + m[1].replace(/\s+/g, ' '));
  const reNS = /const\s+NS\s*=\s*("([^"]+)"|'([^']+)')/g;
  while ((m = reNS.exec(src))) report.push('NS=' + (m[2] || m[3]));
  const reLocaleProp = /locale:\s*"([^"]+)"/g;
  while ((m = reLocaleProp.exec(src))) report.push('locale-prop=' + m[1]);
  if (report.length) lines.push({ pkg, report: [...new Set(report)] });
}
fs.writeFileSync(OUT, JSON.stringify(lines, null, 2));
for (const l of lines) console.log(l.pkg + '  ::  ' + l.report.join(' | '));
