import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const bundle = path.join(root, 'pixgap.bundle.b64');
if (fs.existsSync(bundle)) {
  const tmpZip = path.join(root, '.pixgap-source.zip');
  const encoded = fs.readFileSync(bundle, 'utf8').trim();
  fs.writeFileSync(tmpZip, Buffer.from(encoded, 'base64'));
  execFileSync(process.platform === 'win32' ? 'powershell.exe' : 'unzip',
    process.platform === 'win32'
      ? ['-NoProfile','-Command',`Expand-Archive -Force -LiteralPath '${tmpZip.replaceAll("'","''")}' -DestinationPath '${root.replaceAll("'","''")}'`]
      : ['-o', tmpZip, '-d', root],
    { stdio: 'inherit' });
  const sourceRoot = path.join(root, 'Pixgap');
  if (fs.existsSync(sourceRoot)) {
    for (const entry of fs.readdirSync(sourceRoot)) {
      fs.cpSync(path.join(sourceRoot, entry), path.join(root, entry), { recursive: true, force: true });
    }
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
  fs.rmSync(tmpZip, { force: true });
}
