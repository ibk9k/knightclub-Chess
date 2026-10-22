import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { premoveTargets } from '../src/premoves';

test('a player may plan a move while the opponent has the turn, without changing the game', () => {
  const chess = new Chess(), before = chess.fen();
  assert.deepEqual(premoveTargets(chess, 'e7', 'b').sort(), ['d6', 'e5', 'e6', 'f6']);
  assert.ok(premoveTargets(chess, 'g8', 'b').includes('f6'));
  assert.deepEqual(premoveTargets(chess, 'e2', 'b'), []);
  assert.equal(chess.fen(), before); assert.equal(chess.history().length, 0);
});

test('premove paths respect blockers and piece geometry, while pawn captures may target an empty square', () => {
  const chess = new Chess();
  assert.deepEqual(premoveTargets(chess, 'a8', 'b'), []);
  assert.equal(premoveTargets(chess, 'g8', 'b').includes('g6'), false);
  assert.ok(premoveTargets(chess, 'g8', 'b').includes('h6'));
  assert.ok(premoveTargets(chess, 'd7', 'b').includes('e6'));
  const blocked = new Chess('4k3/4p3/4n3/8/8/8/8/4K3 w - - 0 1');
  assert.equal(premoveTargets(blocked, 'e7', 'b').includes('e5'), false);
});
