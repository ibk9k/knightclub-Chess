import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { makeUci, uci } from '../src/chess-utils';
import { PUZZLES, PUZZLE_THEMES, attemptPuzzleMove, completePuzzle, dailyPuzzle, difficulty, emptyProgress, localDate, mergeProgress, parseProgress, puzzleLine, puzzleReply, startPuzzle, streakFor } from '../src/puzzles';
import type { Puzzle } from '../src/puzzles';

test('the entire catalogue contains unique, legal solutions, all themes, and all levels', () => {
  assert.ok(PUZZLES.length >= 365);
  assert.equal(new Set(PUZZLES.map(puzzle => puzzle.id)).size, PUZZLES.length);
  for (const theme of Object.keys(PUZZLE_THEMES)) assert.ok(PUZZLES.some(puzzle => puzzle.category === theme));
  for (const level of ['Easy', 'Medium', 'Hard']) assert.ok(PUZZLES.filter(puzzle => difficulty(puzzle) === level).length >= 100);
  for (const puzzle of PUZZLES) {
    assert.equal(puzzle.moves.length % 2, 1, `${puzzle.id}: the player must make the last move`);
    const line = puzzleLine(puzzle), game = new Chess(line.at(-1)!.after);
    assert.equal(line.length, puzzle.moves.length);
    if (puzzle.themes.includes('mate')) assert.ok(game.isCheckmate(), puzzle.id);
    let attempt = startPuzzle(puzzle);
    for (let index = 0; index < puzzle.moves.length; index++) {
      if (index % 2) attempt = puzzleReply(puzzle, attempt);
      else { const result = attemptPuzzleMove(puzzle, attempt, puzzle.moves[index]); assert.ok(['correct', 'solved'].includes(result.kind), puzzle.id); attempt = result.attempt; }
    }
    assert.equal(attempt.status, 'solved', puzzle.id);
  }
});

test('wrong and illegal moves preserve the position and never claim completion', () => {
  const puzzle = PUZZLES.find(puzzle => new Chess(puzzle.fen).moves({ verbose: true }).some(move => uci(move) !== puzzle.moves[0] && !new Chess(move.after).isCheckmate()))!;
  const attempt = startPuzzle(puzzle), unchanged = structuredClone(attempt);
  const wrong = new Chess(puzzle.fen).moves({ verbose: true }).find(move => uci(move) !== puzzle.moves[0] && !new Chess(move.after).isCheckmate())!;
  const result = attemptPuzzleMove(puzzle, attempt, uci(wrong));
  assert.equal(result.kind, 'incorrect'); assert.equal(result.attempt.fen, puzzle.fen); assert.equal(result.attempt.index, 0); assert.equal(result.attempt.mistakes, 1);
  assert.deepEqual(attempt, unchanged);
  const illegal = attemptPuzzleMove(puzzle, attempt, 'a1a1');
  assert.equal(illegal.kind, 'illegal'); assert.deepEqual(illegal.attempt, unchanged);
});

test('a correct move waits for exactly one opponent reply and ignores extra input', () => {
  const puzzle = PUZZLES.find(puzzle => puzzle.moves.length >= 3)!;
  const result = attemptPuzzleMove(puzzle, startPuzzle(puzzle), puzzle.moves[0]);
  assert.equal(result.kind, 'correct'); assert.equal(result.attempt.status, 'replying');
  assert.equal(attemptPuzzleMove(puzzle, result.attempt, puzzle.moves[2]).kind, 'illegal');
  const reply = puzzleReply(puzzle, result.attempt);
  assert.equal(reply.index, 2); assert.equal(reply.status, 'playing'); assert.equal(reply.fen, puzzleLine(puzzle)[1].after);
  assert.deepEqual(puzzleReply(puzzle, reply), reply);
});

test('every alternative legal checkmate is accepted', () => {
  const fen = '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1';
  const mates = new Chess(fen).moves({ verbose: true }).filter(move => new Chess(move.after).isCheckmate());
  assert.ok(mates.length > 1);
  const puzzle: Puzzle = { ...PUZZLES[0], fen, moves: [uci(mates[0])], themes: ['mate', 'mateIn1'] };
  for (const mate of mates) assert.equal(attemptPuzzleMove(puzzle, startPuzzle(puzzle), uci(mate)).kind, 'solved');
});

test('promotion is an explicit part of the move and underpromotions are supported', () => {
  const puzzle: Puzzle = { ...PUZZLES[0], fen: '7k/P7/8/5K2/8/8/8/8 w - - 0 1', moves: ['a7a8n'], themes: ['promotion'] };
  assert.ok(makeUci(new Chess(puzzle.fen), 'a7a8n'));
  assert.equal(attemptPuzzleMove(puzzle, startPuzzle(puzzle), 'a7a8q').kind, 'incorrect');
  const result = attemptPuzzleMove(puzzle, startPuzzle(puzzle), 'a7a8n');
  assert.equal(result.kind, 'solved'); assert.equal(new Chess(result.attempt.fen).get('a8')?.type, 'n');
});

test('daily selection is stable for a date and changes on consecutive dates', () => {
  assert.equal(dailyPuzzle('2026-10-23').id, dailyPuzzle('2026-10-23').id);
  assert.notEqual(dailyPuzzle('2026-10-23').id, dailyPuzzle('2026-10-24').id);
  assert.equal(localDate(new Date(2026, 9, 23, 23, 59)), '2026-10-23');
});

test('daily completion counts once, allows hints, and cannot credit yesterday’s puzzle today', () => {
  const date = '2026-10-23', puzzle = dailyPuzzle(date);
  const done = completePuzzle(emptyProgress(), puzzle, date, 2, 1, date);
  assert.equal(done.solved[puzzle.id].assisted, true); assert.deepEqual(done.daily, [date]);
  assert.deepEqual(completePuzzle(done, puzzle, date, 2, 1, date), done);
  assert.equal(completePuzzle(emptyProgress(), puzzle, '2026-10-24', 0, 0, date).daily.length, 0);
  assert.equal(completePuzzle(emptyProgress(), dailyPuzzle('2026-10-24'), '2026-10-24', 0, 0, date).daily.length, 0);
});

test('streak survives until midnight, breaks after a missed day, and keeps its best', () => {
  const progress = { ...emptyProgress(), daily: ['2026-10-20', '2026-10-21', '2026-10-22'] };
  assert.deepEqual(streakFor(progress, '2026-10-22'), { current: 3, best: 3 });
  assert.deepEqual(streakFor(progress, '2026-10-23'), { current: 3, best: 3 });
  assert.deepEqual(streakFor(progress, '2026-10-24'), { current: 0, best: 3 });
  assert.deepEqual(streakFor({ ...progress, daily: [...progress.daily, '2026-10-24'] }, '2026-10-24'), { current: 1, best: 3 });
  assert.deepEqual(streakFor({ ...progress, daily: ['2024-02-28', '2024-02-29', '2024-03-01'] }, '2024-03-02'), { current: 3, best: 3 });
});

test('progress parsing recovers safely from bad storage without inventing completions', () => {
  assert.deepEqual(parseProgress('{broken'), emptyProgress());
  const puzzle = PUZZLES[0];
  const progress = completePuzzle(emptyProgress(), puzzle, '2026-10-23', 0, 1);
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress);
  assert.deepEqual(parseProgress(JSON.stringify({ version: 1, solved: { unknown: {}, [puzzle.id]: { date: '2026-02-31', assisted: false, mistakes: 0 } }, daily: ['2026-02-31', '2026-10-23', '2026-10-23', 4] })), { version: 1, solved: {}, daily: ['2026-10-23'] });
});

test('progress merges preserve other tabs’ solves and upgrade a solve without help', () => {
  const a = completePuzzle(emptyProgress(), PUZZLES[0], '2026-10-23', 2, 0);
  const b = completePuzzle(emptyProgress(), PUZZLES[1], '2026-10-23', 0, 1);
  const merged = mergeProgress(a, b);
  assert.equal(Object.keys(merged.solved).length, 2);
  assert.equal(completePuzzle(merged, PUZZLES[0], '2026-10-23', 0, 1).solved[PUZZLES[0].id].assisted, false);
  assert.equal(completePuzzle(merged, PUZZLES[0], '2026-10-23', 3, 2).solved[PUZZLES[0].id].mistakes, 0);
});
