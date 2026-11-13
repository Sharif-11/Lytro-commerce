// The dashboard's and the console's files compressed once, when the image is built (Phase 9 Slice 9.7, found on
// staging 2026-11-13: the dashboard's script went out as 1.38 MB, the console's as 0.92 MB). Beside each text file over
// 1 KB it writes `<file>.zst` and `<file>.gz` at their best levels; Caddy's `file_server { precompressed }` sends the one
// a browser accepts (deploy/Caddyfile). Node's own zlib, so nothing is added to the build.
//
//   node deploy/static/compress.mjs apps/dashboard/dist apps/operator/dist
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import process from 'node:process';
import { constants, gzipSync, zstdCompressSync } from 'node:zlib';

const TEXT = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.svg',
  '.json',
  '.webmanifest',
  '.txt',
  '.xml',
]);
const SMALLEST = 1024;

function* filesIn(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) yield* filesIn(path);
    else yield path;
  }
}

const folders = process.argv.slice(2);
if (folders.length === 0) {
  process.stderr.write('usage: node deploy/static/compress.mjs <dist folder>...\n');
  process.exit(1);
}
for (const folder of folders) {
  let files = 0;
  let before = 0;
  let after = 0;
  for (const path of filesIn(folder)) {
    if (!TEXT.has(extname(path))) continue;
    const body = readFileSync(path);
    if (body.length < SMALLEST) continue;
    const zst = zstdCompressSync(body, { params: { [constants.ZSTD_c_compressionLevel]: 19 } });
    writeFileSync(`${path}.zst`, zst);
    writeFileSync(`${path}.gz`, gzipSync(body, { level: 9 }));
    files += 1;
    before += body.length;
    after += zst.length;
  }
  const kb = (bytes) => String(Math.round(bytes / 1024));
  process.stdout.write(
    `${folder}: ${String(files)} files, ${kb(before)} KB, ${kb(after)} KB as zstd\n`,
  );
}
