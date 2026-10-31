import './build.mjs';
import { zipSync } from 'fflate';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';

async function collect(root, prefix = '') {
  const files = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, await collect(`${root}/${entry.name}`, name + '/'));
    else if (entry.isFile()) files[name] = new Uint8Array(await readFile(`${root}/${entry.name}`));
  }
  return files;
}
await mkdir('artifacts', { recursive: true });
for (const target of ['chrome', 'firefox']) {
  const archive = zipSync(await collect(`dist/${target}`), { level: 6 });
  const path = `artifacts/trackless-${target}.zip`;
  await writeFile(path, archive);
  console.log(path);
}
