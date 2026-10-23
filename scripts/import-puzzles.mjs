// A bounded sample from the primary, CC0 Lichess puzzle export.
// Requires Node 24+ for streaming Zstandard. Run from the project root.
import { createZstdDecompress } from 'node:zlib';
import { Readable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { Chess } from 'chess.js';

const themes = ['mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'discoveredAttack', 'backRankMate', 'hangingPiece', 'promotion', 'sacrifice', 'deflection'];
const pools = new Map(themes.flatMap(theme => [0, 1, 2].map(level => [`${theme}:${level}`, []])));
const controller = new AbortController();
const response = await fetch('https://database.lichess.org/lichess_db_puzzle.csv.zst', { signal: controller.signal, headers: { Range: 'bytes=0-8388607' } });
if (!response.ok) throw new Error(`Puzzle export: HTTP ${response.status}`);
let buffer = '', rows = 0;
const compressed = Buffer.from(await response.arrayBuffer());
// The export starts with a skippable metadata frame; Node's decoder stops
// there, so strip only that standard prefix before streaming the data frame.
let offset = 0;
while ((compressed.readUInt32LE(offset) & 0xfffffff0) === 0x184d2a50) offset += 8 + compressed.readUInt32LE(offset + 4);
const stream = Readable.from([compressed.subarray(offset)]).pipe(createZstdDecompress());
try {
  for await (const chunk of stream) {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1); rows++;
      const [id, before, moves, rawRating, deviation, popularity, plays, tags, gameUrl] = line.split(',');
      const rating = Number(rawRating), level = rating < 1000 ? 0 : rating < 1500 ? 1 : 2;
      if (rating < 450 || rating > 2000 || Number(deviation) > 90 || Number(popularity) < 85 || Number(plays) < 100) continue;
      const sourceMoves = moves.split(' '), puzzleThemes = tags.split(' ');
      if (sourceMoves.length < 2 || sourceMoves.length > 8 || sourceMoves.length % 2 !== 0) continue;
      for (const theme of themes) {
        const pool = pools.get(`${theme}:${level}`);
        if (!puzzleThemes.includes(theme) || pool.length >= 12) continue;
        try {
          const game = new Chess(before);
          const apply = text => game.move({ from: text.slice(0, 2), to: text.slice(2, 4), promotion: text[4] || 'q' });
          const setup = apply(sourceMoves[0]);
          const fen = game.fen();
          sourceMoves.slice(1).forEach(apply);
          if (puzzleThemes.includes('mate') && !game.isCheckmate()) continue;
          pool.push({ id, fen, setup: setup.lan, lastMove: setup.san, moves: sourceMoves.slice(1), rating, themes: puzzleThemes, category: theme, gameUrl });
        } catch { /* Invalid/incompatible export positions are excluded. */ }
      }
    }
    if (rows > 45000 || [...pools.values()].every(pool => pool.length >= 12)) break;
  }
} catch (error) {
  // A bounded HTTP range may end in the middle of a Zstandard frame.
  if (rows < 1000) throw error;
} finally { controller.abort(); stream.destroy(); }

const seen = new Set(), puzzles = [];
// Round-robin selection keeps the catalogue varied, not dominated by mates.
for (let i = 0; i < 12; i++) for (const [key, pool] of pools) {
  const puzzle = pool[i];
  if (puzzle && !seen.has(puzzle.id)) { seen.add(puzzle.id); puzzles.push(puzzle); }
}
if (puzzles.length < 240) throw new Error(`Only ${puzzles.length} suitable puzzles in ${rows} rows`);
await writeFile('src/puzzle-data.json', JSON.stringify(puzzles, null, 2) + '\n');
console.log(JSON.stringify({ puzzles: puzzles.length, rows, categories: Object.fromEntries(themes.map(theme => [theme, puzzles.filter(p => p.category === theme).length])), levels: [0, 1, 2].map(level => puzzles.filter(p => (p.rating < 1000 ? 0 : p.rating < 1500 ? 1 : 2) === level).length) }));
