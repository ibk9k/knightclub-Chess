import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { explainIllegalMove } from '../src/move-rules';
import { makeUci } from '../src/chess-utils';

test('legal moves, castling, and promotion destinations have no rejection explanation', () => {
  for (const chess of [new Chess(), new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'), new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1')]) {
    const before = chess.fen(), pgn = chess.pgn();
    for (const move of chess.moves({ verbose: true })) assert.equal(explainIllegalMove(chess, move.from, move.to), null, move.san);
    assert.equal(chess.fen(), before); assert.equal(chess.pgn(), pgn);
  }
});

test('castling while in check is explained for both colors, even with another blocker', () => {
  assert.equal(explainIllegalMove(new Chess('k3r3/8/8/8/8/8/8/4KBNR w K - 0 1'), 'e1', 'g1'), 'You can’t castle while your king is in check.');
  assert.equal(explainIllegalMove(new Chess('4k2r/8/8/8/8/8/8/K3R3 b k - 0 1'), 'e8', 'g8'), 'You can’t castle while your king is in check.');
});

test('castling distinguishes a blocked path, crossing check, and landing in check', () => {
  assert.match(explainIllegalMove(new Chess(), 'e1', 'g1')!, /bishop on f1.*must be empty/);
  assert.match(explainIllegalMove(new Chess('4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1'), 'e1', 'c1')!, /knight on b1/);
  assert.match(explainIllegalMove(new Chess('k4r2/8/8/8/8/8/8/4K2R w K - 0 1'), 'e1', 'g1')!, /through check.*f1/);
  assert.match(explainIllegalMove(new Chess('k5r1/8/8/8/8/8/8/4K2R w K - 0 1'), 'e1', 'g1')!, /into check.*g1/);
  assert.match(explainIllegalMove(new Chess('4k2r/8/8/8/8/8/8/K4R2 b k - 0 1'), 'e8', 'g8')!, /through check.*f8/);
  assert.equal(explainIllegalMove(new Chess('1r2k3/8/8/8/8/8/8/R3K3 w Q - 0 1'), 'e1', 'c1'), null, 'An attacked b1 does not prevent queenside castling');
});

test('castling explains known king and rook movement without inventing imported history', () => {
  const king = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  for (const move of ['e1e2', 'e8e7', 'e2e1', 'e7e8']) assert.ok(makeUci(king, move));
  const before = king.pgn();
  assert.match(explainIllegalMove(king, 'e1', 'g1')!, /king has already moved/);
  assert.equal(king.pgn(), before);
  const rook = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  for (const move of ['h1h2', 'e8e7', 'h2h1', 'e7e8']) assert.ok(makeUci(rook, move));
  assert.match(explainIllegalMove(rook, 'e1', 'g1')!, /rook has already moved/);
  assert.equal(explainIllegalMove(rook, 'e1', 'c1'), null);
  assert.match(explainIllegalMove(new Chess('4k3/8/8/8/8/8/8/R3K2R w - - 0 1'), 'e1', 'g1')!, /isn’t available/);
  assert.match(explainIllegalMove(new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), 'e1', 'g1')!, /rook on h1/);
});

test('piece movement and blocked paths get specific explanations without moving pieces', () => {
  const chess = new Chess(), before = chess.fen();
  const attempts: [Square, Square, RegExp][] = [
    ['b1', 'b3', /Knights move in an L shape/], ['c1', 'c3', /Bishops move diagonally/],
    ['a1', 'b3', /Rooks move in straight lines/], ['d1', 'e3', /Queens move in straight lines/],
    ['c1', 'h6', /pawn on d2 is blocking your bishop/], ['a1', 'a4', /pawn on a2 is blocking your rook/],
    ['e2', 'e5', /one square forward, or two squares/], ['e2', 'd3', /Pawns capture diagonally only/],
    ['e1', 'e3', /Kings move one square/], ['e2', 'e1', /own king/], ['e7', 'e6', /White’s turn/],
  ];
  for (const [from, to, expected] of attempts) assert.match(explainIllegalMove(chess, from, to)!, expected);
  assert.equal(chess.fen(), before); assert.equal(chess.history().length, 0);
});

test('pawn rules explain direction, the initial double move, and blocked or straight captures', () => {
  assert.match(explainIllegalMove(new Chess('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1'), 'e4', 'e3')!, /can’t move backward/);
  assert.match(explainIllegalMove(new Chess('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1'), 'e4', 'e6')!, /only from its starting square/);
  assert.match(explainIllegalMove(new Chess('4k3/8/8/8/8/4p3/4P3/4K3 w - - 0 1'), 'e2', 'e3')!, /can’t capture straight ahead/);
  assert.match(explainIllegalMove(new Chess('4k3/8/8/8/8/4N3/4P3/4K3 w - - 0 1'), 'e2', 'e4')!, /piece on e3.*Both squares/);
  assert.match(explainIllegalMove(new Chess('4k3/8/8/4p3/8/8/8/4K3 b - - 0 1'), 'e5', 'e6')!, /can’t move backward/);
});

test('king safety distinguishes an exposed king, an unresolved check, and an unsafe king move', () => {
  assert.match(explainIllegalMove(new Chess('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1'), 'e2', 'd2')!, /would leave your king in check/);
  assert.match(explainIllegalMove(new Chess('k3r3/8/8/8/8/8/8/R3K3 w - - 0 1'), 'a1', 'a2')!, /king is in check.*doesn’t get it out/);
  assert.match(explainIllegalMove(new Chess('k3r3/8/8/8/8/8/8/3K4 w - - 0 1'), 'd1', 'e1')!, /can’t move into check.*e1/);
  assert.match(explainIllegalMove(new Chess('8/8/8/8/8/4k3/8/4K3 w - - 0 1'), 'e1', 'e2')!, /can’t move into check/);
});

test('en passant explains an expired chance and checks both vacated pawn squares for king safety', () => {
  const pinned = new Chess('k7/8/8/r4pPK/8/8/8/8 w - f6 0 1');
  const before = pinned.fen({ forceEnpassantSquare: true });
  assert.match(explainIllegalMove(pinned, 'g5', 'f6')!, /would leave your king in check/);
  assert.equal(pinned.fen({ forceEnpassantSquare: true }), before);
  assert.match(explainIllegalMove(new Chess('k7/8/8/5pPK/8/8/8/8 w - - 0 1'), 'g5', 'f6')!, /only allowed immediately/);
  assert.equal(explainIllegalMove(new Chess('k7/8/8/5pPK/8/8/8/8 w - f6 0 1'), 'g5', 'f6'), null);
});
