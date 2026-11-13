/**
 * Static release-security checks over the built extension (plan T36).
 * Informational-but-strict: exits non-zero on violations.
 *
 * Checks:
 *  1. Manifest never requests <all_urls> or grants host permissions upfront.
 *  2. No remote executable code references in the bundle (eval/new Function/document.write).
 *  3. Storage.sync is never used (keys must never sync).
 *  4. No API key material ("sk-" prefixed literals) in the bundle.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const outDir = join(process.cwd(), '.output', 'chrome-mv3');
let failures = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(outDir);
} catch {
  console.error('FAIL: no build output found. Run `npm run build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
if (manifest.permissions?.includes('<all_urls>')) fail('manifest requests <all_urls>');
if (manifest.host_permissions && manifest.host_permissions.length > 0) {
  fail('manifest grants host_permissions upfront');
}
if ((manifest.content_scripts?.length ?? 0) > 0) {
  fail('manifest declares content_scripts (scanner must be injected on demand only)');
}

const jsFiles = files.filter((f) => ['.js', '.mjs', '.html'].includes(extname(f)));
for (const file of jsFiles) {
  const text = readFileSync(file, 'utf8');
  if (/\beval\s*\(/.test(text)) fail(`${file}: uses eval()`);
  if (/new\s+Function\s*\(/.test(text)) fail(`${file}: uses new Function()`);
  if (/document\.write\s*\(/.test(text)) fail(`${file}: uses document.write()`);
  if (/storage\.sync/.test(text)) fail(`${file}: references storage.sync (keys must never sync)`);
  if (/["']sk-[A-Za-z0-9]{8,}["']/.test(text)) fail(`${file}: contains hardcoded API key material`);
}

if (failures === 0) {
  console.log(`Security checks passed for ${jsFiles.length} files in .output/chrome-mv3.`);
}
process.exit(failures === 0 ? 0 : 1);
