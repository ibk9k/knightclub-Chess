import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { classifyMove, makeUci, gameOutcome, pvToSan, uci } from '../src/chess-utils';
import type { Evaluation } from '../src/chess-utils';

const evaluation = (cp: number, bestMove = 'e2e4'): Evaluation => ({ cp, mate: null, bestMove, pv: [bestMove], depth: 15 });

test('move classification measures loss from the mover’s perspective for both colors', () => {
  const white = classifyMove(evaluation(100), evaluation(-180), 'w', 'a2a3');
  const black = classifyMove(evaluation(-100), evaluation(180), 'b', 'a7a6');
  assert.equal(white.quality, 'Blunder');
  assert.deepEqual(white, black);
  assert.equal(classifyMove(evaluation(0), evaluation(40), 'b', 'a7a6').quality, 'Good');
  assert.equal(classifyMove(evaluation(0), evaluation(40), 'w', 'a2a3').quality, 'Excellent');
});

test('best-move recognition survives search evaluation drift', () => {
  assert.equal(classifyMove(evaluation(50, 'e2e4'), evaluation(-20), 'w', 'e2e4').quality, 'Best');
});

test('UCI application enforces legality, handles promotion, and preserves SAN', () => {
  const c = new Chess();
  assert.equal(makeUci(c, 'e2e5'), null);
  assert.equal(makeUci(c, 'e2e4')?.san, 'e4');
  assert.equal(makeUci(c, 'nonsense'), null);
  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(makeUci(promotion, 'a7a8n')?.promotion, 'n');
  assert.equal(promotion.get('a8')?.type, 'n');
});

test('castling and en passant work through the same move path used by the UI', () => {
  const c = new Chess();
  for (const move of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']) assert.ok(makeUci(c, move));
  assert.equal(makeUci(c, 'e1g1')?.san, 'O-O');
  assert.equal(c.get('f1')?.type, 'r');
  const ep = new Chess();
  for (const move of ['e2e4', 'a7a6', 'e4e5', 'd7d5']) makeUci(ep, move);
  const capture = makeUci(ep, 'e5d6');
  assert.ok(capture?.isEnPassant());
  assert.equal(ep.get('d5'), undefined);
});

test('checkmate and stalemate have distinct game outcomes', () => {
  const c = new Chess();
  for (const move of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) makeUci(c, move);
  assert.equal(gameOutcome(c), 'Black wins by checkmate');
  assert.equal(gameOutcome(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), 'Draw by stalemate');
});

test('principal variations stop at illegal moves and can be exported and reimported', () => {
  const c = new Chess();
  assert.deepEqual(pvToSan(c.fen(), ['e2e4', 'e7e5', 'g1f3', 'a8a1']), ['e4', 'e5', 'Nf3']);
  for (const move of ['e2e4', 'c7c5', 'g1f3', 'd7d6']) makeUci(c, move);
  const restored = new Chess(); restored.loadPgn(c.pgn());
  assert.equal(restored.fen(), c.fen());
  assert.equal(uci(restored.history({ verbose: true })[0]), 'e2e4');
});
