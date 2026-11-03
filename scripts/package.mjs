import { cpSync, createWriteStream, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import yazl from 'yazl';

const version = process.argv[2] ?? 'dev';
const run = (cmd, env = {}) =>
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

function collectFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(root);
  return files;
}

// The bundled bsdtar crashes when spawned from Node on this Windows setup, so zip in-process.
// yazl preserves dotfiles and writes spec-compliant forward-slash entry names.
// Skip non-ASCII names: bsdtar/Expand-Archive on the target PC fail to read them under a legacy
// code page. The only such file today is a test fixture inside @fastify/send.
function zipDir(root, out) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const file of collectFiles(root)) {
      const name = relative(root, file).split(sep).join('/');
      if (/[^\x20-\x7E]/.test(name)) {
        console.warn(`skipping non-ASCII path: ${name}`);
        continue;
      }
      zip.addFile(file, name);
    }
    zip.outputStream
      .pipe(createWriteStream(out))
      .on('close', resolve)
      .on('error', reject);
    zip.end();
  });
}

rmSync('release', { recursive: true, force: true });
run('pnpm -r run build');
// hoisted linker: no symlinks/junctions in node_modules, so the zip is portable
run('pnpm --filter api deploy --legacy --prod --prefer-offline release/app', {
  npm_config_node_linker: 'hoisted',
});
cpSync('apps/web/dist', 'release/app/public', { recursive: true });
cpSync('ops', 'release/app/ops', { recursive: true });
cpSync(process.execPath, 'release/app/node.exe');
writeFileSync('release/app/VERSION', version);
await zipDir('release/app', 'release/app.zip');
writeFileSync(
  'release/app.zip.sha256',
  createHash('sha256').update(readFileSync('release/app.zip')).digest('hex'),
);
