// Minimal asar reader: lists entries (optionally filtered by substring) or extracts a file.
const fs = require('fs');
const path = require('path');

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
    else out.push({ path: p, size: entry.size, offset: entry.offset, unpacked: !!entry.unpacked, link: entry.link });
  }
}

const asar = process.argv[2];
const mode = process.argv[3] || 'list';
const arg = process.argv[4];

const { header, dataOffset } = readHeader(asar);
if (mode === 'list') {
  const out = [];
  walk(header, '', out);
  const re = arg ? new RegExp(arg, 'i') : null;
  for (const e of out) {
    if (!re || re.test(e.path)) console.log(`${e.unpacked ? 'U' : ' '} ${String(e.size).padStart(10)} ${e.path}`);
  }
} else if (mode === 'extract') {
  const out = [];
  walk(header, '', out);
  const e = out.find((x) => x.path === arg);
  if (!e) { console.error('not found: ' + arg); process.exit(2); }
  const target = process.argv[5];
  if (e.link) { console.log('LINK ' + e.link); process.exit(0); }
  if (e.unpacked) { console.error('unpacked -> ' + path.join(path.dirname(asar) + '.unpacked', e.path)); process.exit(3); }
  const fd = fs.openSync(asar, 'r');
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, dataOffset + Number(e.offset));
  fs.closeSync(fd);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
  console.log('wrote ' + target + ' (' + e.size + ' bytes)');
}
