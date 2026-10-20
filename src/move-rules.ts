import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';

const names: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const colorName = (color: Color) => color === 'w' ? 'White' : 'Black';
const opposite = (color: Color): Color => color === 'w' ? 'b' : 'w';
const squareAt = (file: number, rank: number) => `${'abcdefgh'[file]}${rank}` as Square;

export function isCastleAttempt(chess: Chess, from: Square, to: Square): boolean {
  return chess.get(from)?.type === 'k' && from[1] === to[1] && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2;
}

function explainCastling(chess: Chess, from: Square, to: Square, color: Color): string {
  const rank = color === 'w' ? 1 : 8, kingSide = to[0] > from[0];
  if (from !== `e${rank}` || to !== `${kingSide ? 'g' : 'c'}${rank}`) return `Castling starts with your king on e${rank}. A king that has moved can’t castle.`;
  if (chess.isCheck()) return 'You can’t castle while your king is in check.';
  const rookSquare = `${kingSide ? 'h' : 'a'}${rank}` as Square;
  const rook = chess.get(rookSquare);
  if (rook?.type !== 'r' || rook.color !== color) return `You need your rook on ${rookSquare} to castle on this side.`;
  if (!chess.getCastlingRights(color)[kingSide ? 'k' : 'q']) {
    const history = chess.history({ verbose: true });
    if (history.some(move => move.color === color && move.piece === 'k')) return 'Your king has already moved. Even if it returns to its starting square, it can’t castle.';
    if (history.some(move => move.color === color && move.piece === 'r' && move.from === rookSquare)) return 'That rook has already moved. A rook that has moved can’t be used for castling.';
    return 'Castling isn’t available on this side. The king and rook must never have moved.';
  }
  for (const file of kingSide ? [5, 6] : [3, 2, 1]) {
    const square = squareAt(file, rank), piece = chess.get(square);
    if (piece) return `The ${names[piece.type]} on ${square} is in the way. The squares between your king and rook must be empty.`;
  }
  for (const file of kingSide ? [5, 6] : [3, 2]) {
    const square = squareAt(file, rank), test = new Chess(chess.fen());
    test.remove(from); test.put({ type: 'k', color }, square);
    if (test.isAttacked(square, opposite(color))) return square === to
      ? `You can’t castle into check. ${square} is attacked by ${colorName(opposite(color))}.`
      : `You can’t castle through check. Your king would cross ${square}, which is attacked by ${colorName(opposite(color))}.`;
  }
  return 'You can’t castle in this position. The path must be clear and your king must stay out of check.';
}

/** Explain a rejected attempt using chess rules only; never change the game. */
export function explainIllegalMove(chess: Chess, from: Square, to: Square): string | null {
  const piece = chess.get(from);
  if (!piece) return `There’s no piece on ${from}. Choose a piece first.`;
  if (piece.color !== chess.turn()) return `It’s ${colorName(chess.turn())}’s turn. Choose a ${chess.turn() === 'w' ? 'white' : 'black'} piece.`;
  if (from === to) return null;
  // The rules engine is the authority. Promotion choices share a destination.
  if (chess.moves({ square: from, verbose: true }).some(move => move.to === to)) return null;
  if (isCastleAttempt(chess, from, to)) return explainCastling(chess, from, to, piece.color);
  const target = chess.get(to);
  if (target?.color === piece.color) return `Your own ${names[target.type]} is on ${to}. You can’t capture your own pieces.`;
  if (target?.type === 'k') return 'Kings aren’t captured. The goal is to checkmate the king so it has no legal escape.';
  const df = to.charCodeAt(0) - from.charCodeAt(0), dr = Number(to[1]) - Number(from[1]);
  const dx = Math.abs(df), dy = Math.abs(dr);
  const epSquare = chess.fen({ forceEnpassantSquare: true }).split(' ')[3];
  if (piece.type === 'p') {
    const forward = piece.color === 'w' ? 1 : -1, startRank = piece.color === 'w' ? '2' : '7';
    if (dr * forward <= 0) return 'Pawns move forward. They can’t move backward or sideways.';
    if (dx === 0) {
      if (target) return 'Pawns can’t capture straight ahead. They capture one square diagonally forward.';
      if (dy > 2) return 'Pawns move one square forward, or two squares from their starting square.';
      if (dy === 2 && from[1] !== startRank) return 'A pawn can move two squares only from its starting square.';
      const middle = `${from[0]}${Number(from[1]) + forward}` as Square;
      if (dy === 2 && chess.get(middle)) return `The piece on ${middle} blocks your pawn. Both squares must be clear for a two-square move.`;
    } else if (dx === 1 && dy === 1) {
      if (!target && epSquare !== to) {
        const adjacent = chess.get(`${to[0]}${from[1]}` as Square);
        if (from[1] === (piece.color === 'w' ? '5' : '4') && adjacent?.type === 'p' && adjacent.color !== piece.color) return 'En passant is only allowed immediately after the adjacent pawn moves two squares. You can’t capture on that empty square now.';
        return 'Pawns capture diagonally only when an opponent’s piece is there, except for en passant. Move straight ahead to an empty square.';
      }
    } else return 'Pawns move straight forward and capture one square diagonally forward.';
  }
  if (piece.type === 'n' && !(dx === 1 && dy === 2 || dx === 2 && dy === 1)) return 'Knights move in an L shape: two squares one way and one square to the side. They can jump over pieces.';
  if (piece.type === 'b' && dx !== dy) return 'Bishops move diagonally. They stay on the same color of square.';
  if (piece.type === 'r' && dx !== 0 && dy !== 0) return 'Rooks move in straight lines along a row or column.';
  if (piece.type === 'q' && dx !== 0 && dy !== 0 && dx !== dy) return 'Queens move in straight lines along a row, column, or diagonal.';
  if (piece.type === 'k' && Math.max(dx, dy) > 1) return 'Kings move one square in any direction, except when castling.';
  if (['b', 'r', 'q'].includes(piece.type)) {
    for (let step = 1; step < Math.max(dx, dy); step++) {
      const square = squareAt(from.charCodeAt(0) - 97 + Math.sign(df) * step, Number(from[1]) + Math.sign(dr) * step);
      const blocker = chess.get(square);
      if (blocker) return `The ${names[blocker.type]} on ${square} is blocking your ${names[piece.type]}. ${names[piece.type][0].toUpperCase() + names[piece.type].slice(1)}s can’t jump over pieces.`;
    }
  }
  // The movement pattern is valid, but it may expose the king. Simulate on a
  // copy, including the captured pawn in en passant, so history stays intact.
  const test = new Chess(chess.fen());
  test.remove(from); test.remove(to);
  if (piece.type === 'p' && dx === 1 && !target && epSquare === to) test.remove(`${to[0]}${from[1]}` as Square);
  test.put(piece, to);
  const king = test.findPiece({ type: 'k', color: piece.color })[0];
  if (king && test.isAttacked(king, opposite(piece.color))) {
    if (piece.type === 'k') return `Your king can’t move into check. ${to} is attacked by ${colorName(opposite(piece.color))}.`;
    if (chess.isCheck()) return 'Your king is in check. This move doesn’t get it out of check.';
    return `Moving this ${names[piece.type]} would leave your king in check. You must keep your king safe.`;
  }
  return 'That move isn’t legal in this position. Choose a different destination.';
}
