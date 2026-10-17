// Extract every asar entry under a path prefix, preserving the tree.
// usage: node tools/asar-extract-tree.cjs <app.asar> <prefix> <out-dir>
const fs = require('fs');
const path = require('path');

const [ASAR, PREFIX, OUT] = process.argv.slice(2);

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
let written = 0;
for (const entry of entries) {
  if (!entry.path.startsWith(PREFIX)) continue;
  const target = path.join(OUT, entry.path.slice(PREFIX.length));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (entry.unpacked) continue;
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, dataOffset + entry.offset);
  fs.writeFileSync(target, buf);
  written += 1;
}
console.log(`extracted ${written} file(s) into ${OUT}`);
