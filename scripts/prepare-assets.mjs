import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('public/engine', { recursive: true });
const files = await readdir('node_modules/stockfish/bin');
const engine = files.find(f => /lite-single.*\.js$/.test(f));
const wasm = files.find(f => /lite-single.*\.wasm$/.test(f));
if (!engine || !wasm) throw new Error('Stockfish single-threaded engine assets not found');
for (const file of [engine, wasm]) await copyFile(resolve('node_modules/stockfish/bin', file), resolve('public/engine', file));
await copyFile('node_modules/stockfish/Copying.txt', 'public/engine/LICENSE.txt').catch(async () => {
  const names = await readdir('node_modules/stockfish');
  const license = names.find(n => /copying|license/i.test(n));
  if (license) await copyFile(resolve('node_modules/stockfish', license), 'public/engine/LICENSE.txt');
});
await writeFile('src/engine-path.ts', `export const ENGINE_PATH = '/engine/${engine}';\n`);
await mkdir('public/pieces', { recursive: true });
for (const color of ['w', 'b']) {
  for (const piece of ['K', 'Q', 'R', 'B', 'N', 'P']) {
    const name = `${color}${piece}.svg`;
    const response = await fetch(`https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${name}`);
    if (!response.ok) throw new Error(`Unable to fetch ${name}: ${response.status}`);
    await writeFile(`public/pieces/${name}`, await response.text());
  }
}
await writeFile('public/pieces/LICENSE.txt', 'Chess pieces by Colin M. L. Burnett, CC BY-SA 3.0. Source: https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces ; distributed by https://github.com/lichess-org/lila/tree/master/public/piece/cburnett\n');
console.log(`Stockfish and 12 chess pieces prepared: ${engine}`);
