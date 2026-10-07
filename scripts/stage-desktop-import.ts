import { readFile } from 'node:fs/promises';
import { stageDesktopImport } from '../server/desktop-import';

try {
  if (!process.argv[2]) throw new Error('Missing input');
  const result = await stageDesktopImport(JSON.parse(await readFile(process.argv[2], 'utf8')));
  console.log(JSON.stringify({ ready: true, ...result }));
} catch {
  console.error('Private desktop import could not be prepared. Check the input or an unfinished import.');
  process.exitCode = 1;
}
