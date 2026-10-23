import { Chess } from 'chess.js';
import { makeUci, uci } from './chess-utils';
import puzzleData from './puzzle-data.json';

export const PUZZLE_THEMES = {
  mateIn1: { label: 'Mate in one', hint: 'Finish the game with one move. Check every way you can give check.' },
  mateIn2: { label: 'Mate in two', hint: 'You can force checkmate on your second move. Look for checks and threats that leave the king with no escape.' },
  mateIn3: { label: 'Mate in three', hint: 'A checkmating sequence is here. Think through the king’s escape squares.' },
  fork: { label: 'Forks', hint: 'Attack two targets at once. Can one of your pieces create a double threat?' },
  pin: { label: 'Pins', hint: 'Look for a piece that cannot move without exposing something more valuable behind it.' },
  skewer: { label: 'Skewers', hint: 'Attack a valuable piece so that moving it exposes another target behind it.' },
  discoveredAttack: { label: 'Discovered attacks', hint: 'Moving one piece can uncover an attack from a piece behind it.' },
  backRankMate: { label: 'Back-rank mates', hint: 'Look at the king’s back rank. Its own pawns may be blocking its escape.' },
  hangingPiece: { label: 'Loose pieces', hint: 'Check which pieces are undefended. A forcing move may let you take one safely.' },
  promotion: { label: 'Promotions', hint: 'A pawn is close to promotion. Can you help it reach the last rank?' },
  sacrifice: { label: 'Sacrifices', hint: 'Consider giving up material to create a stronger threat. Follow the forcing moves.' },
  deflection: { label: 'Deflections', hint: 'A defender has an important job. Can you force it away from that job?' },
} as const;
export type PuzzleTheme = keyof typeof PUZZLE_THEMES;
export interface Puzzle { id: string; fen: string; setup: string; lastMove: string; moves: string[]; rating: number; themes: string[]; category: string; gameUrl: string }
export const PUZZLES: Puzzle[] = puzzleData;
export const difficulty = (puzzle: Puzzle) => puzzle.rating < 1000 ? 'Easy' : puzzle.rating < 1500 ? 'Medium' : 'Hard';
export const themeFor = (puzzle: Puzzle) => PUZZLE_THEMES[puzzle.category as PuzzleTheme];
export const puzzleNumber = (puzzle: Puzzle) => String(PUZZLES.indexOf(puzzle) + 1).padStart(3, '0');
export const puzzleTitle = (puzzle: Puzzle) => `Challenge ${puzzleNumber(puzzle)}`;

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
export function dailyPuzzle(date: string): Puzzle {
  // A fixed sequence, shared by everyone on the same local calendar day.
  const pool = PUZZLES.filter(puzzle => puzzle.rating <= 1500 && puzzle.moves.length <= 5);
  return pool[((dayNumber(date) + 71) % pool.length + pool.length) % pool.length];
}

export interface PuzzleAttempt { fen: string; index: number; status: 'playing' | 'replying' | 'solved'; mistakes: number; hints: number }
export function startPuzzle(puzzle: Puzzle): PuzzleAttempt { return { fen: puzzle.fen, index: 0, status: 'playing', mistakes: 0, hints: 0 }; }
export function attemptPuzzleMove(puzzle: Puzzle, attempt: PuzzleAttempt, move: string): { kind: 'illegal' | 'incorrect' | 'correct' | 'solved'; attempt: PuzzleAttempt } {
  if (attempt.status !== 'playing') return { kind: 'illegal', attempt };
  const game = new Chess(attempt.fen), played = makeUci(game, move);
  if (!played) return { kind: 'illegal', attempt };
  // Lichess explicitly permits alternative checkmates, including mate in one.
  if (uci(played) !== puzzle.moves[attempt.index] && !game.isCheckmate()) return { kind: 'incorrect', attempt: { ...attempt, mistakes: attempt.mistakes + 1 } };
  const index = attempt.index + 1, solved = index >= puzzle.moves.length || game.isCheckmate();
  return { kind: solved ? 'solved' : 'correct', attempt: { ...attempt, fen: game.fen(), index, status: solved ? 'solved' : 'replying' } };
}
export function puzzleReply(puzzle: Puzzle, attempt: PuzzleAttempt): PuzzleAttempt {
  if (attempt.status !== 'replying') return attempt;
  const game = new Chess(attempt.fen);
  if (!makeUci(game, puzzle.moves[attempt.index])) throw new Error('Invalid puzzle continuation');
  return { ...attempt, fen: game.fen(), index: attempt.index + 1, status: 'playing' };
}
export function puzzleLine(puzzle: Puzzle) {
  const game = new Chess(puzzle.fen);
  return puzzle.moves.map(text => {
    const move = makeUci(game, text);
    if (!move) throw new Error('Invalid puzzle solution');
    return { uci: text, san: move.san, color: move.color, before: move.before, after: move.after };
  });
}

export const PUZZLE_STORAGE_KEY = 'knight-club-puzzles-v1';
export interface PuzzleCompletion { date: string; assisted: boolean; mistakes: number }
export interface PuzzleProgress { version: 1; solved: Record<string, PuzzleCompletion>; daily: string[] }
export const emptyProgress = (): PuzzleProgress => ({ version: 1, solved: {}, daily: [] });
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(dayNumber(value) * 86_400_000).toISOString().slice(0, 10) === value;
export function parseProgress(raw: string | null): PuzzleProgress {
  try {
    const value = JSON.parse(raw || 'null');
    if (value?.version !== 1) return emptyProgress();
    const solved: PuzzleProgress['solved'] = {};
    for (const puzzle of PUZZLES) {
      const entry = value.solved?.[puzzle.id];
      if (entry && validDate(entry.date) && typeof entry.assisted === 'boolean' && Number.isInteger(entry.mistakes) && entry.mistakes >= 0) solved[puzzle.id] = entry;
    }
    return { version: 1, solved, daily: Array.isArray(value.daily) ? [...new Set<string>(value.daily.filter(validDate))].sort() : [] };
  } catch { return emptyProgress(); }
}
export function mergeProgress(a: PuzzleProgress, b: PuzzleProgress): PuzzleProgress {
  const solved = { ...a.solved };
  for (const [id, entry] of Object.entries(b.solved)) {
    const previous = solved[id];
    if (!previous || previous.assisted && !entry.assisted || previous.assisted === entry.assisted && entry.mistakes < previous.mistakes) solved[id] = entry;
  }
  return { version: 1, solved, daily: [...new Set([...a.daily, ...b.daily])].sort() };
}
export function completePuzzle(progress: PuzzleProgress, puzzle: Puzzle, date: string, hints: number, mistakes: number, dailyDate?: string): PuzzleProgress {
  const addition = emptyProgress();
  addition.solved[puzzle.id] = { date, assisted: hints > 0, mistakes };
  if (dailyDate === date && dailyPuzzle(date).id === puzzle.id) addition.daily.push(date);
  return mergeProgress(progress, addition);
}
export function streakFor(progress: PuzzleProgress, today: string): { current: number; best: number } {
  const days = progress.daily.filter(date => date <= today).map(dayNumber).sort((a, b) => a - b);
  const now = dayNumber(today);
  let run = 0, best = 0, previous = -Infinity;
  for (const day of days) { run = day === previous + 1 ? run + 1 : 1; best = Math.max(best, run); previous = day; }
  return { current: previous === now || previous === now - 1 ? run : 0, best };
}
