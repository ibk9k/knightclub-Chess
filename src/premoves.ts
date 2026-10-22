import type { Chess, Color, PieceSymbol, Square } from 'chess.js';

export interface Premove { from: Square; to: Square; promotion: PieceSymbol; ply: number; color: Color }

// Premove targets describe movement, not predictions of the opponent's reply.
// Pawn captures may target an empty square. Legality is checked again at play.
export function premoveTargets(chess: Chess, from: Square, color: Color): Square[] {
  const piece = chess.get(from);
  if (!piece || piece.color !== color) return [];
  const targets: Square[] = [], x = from.charCodeAt(0) - 97, y = Number(from[1]);
  const add = (file: number, rank: number) => {
    if (file < 0 || file > 7 || rank < 1 || rank > 8) return false;
    const square = `${'abcdefgh'[file]}${rank}` as Square, target = chess.get(square);
    if (target?.color !== color && target?.type !== 'k') targets.push(square);
    return !target;
  };
  if (piece.type === 'p') {
    const d = color === 'w' ? 1 : -1;
    if (!chess.get(`${from[0]}${y + d}` as Square)) {
      add(x, y + d);
      if (y === (color === 'w' ? 2 : 7) && !chess.get(`${from[0]}${y + 2 * d}` as Square)) add(x, y + 2 * d);
    }
    add(x - 1, y + d); add(x + 1, y + d);
  } else if (piece.type === 'n') {
    for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(x + dx, y + dy);
  } else {
    const directions = piece.type === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
      : piece.type === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of directions) for (let n = 1; n <= (piece.type === 'k' ? 1 : 7); n++) if (!add(x + dx * n, y + dy * n)) break;
    if (piece.type === 'k' && from === `e${color === 'w' ? 1 : 8}`) {
      const rights = chess.getCastlingRights(color);
      if (rights.k && ['f', 'g'].every(file => !chess.get(`${file}${y}` as Square))) add(6, y);
      if (rights.q && ['b', 'c', 'd'].every(file => !chess.get(`${file}${y}` as Square))) add(2, y);
    }
  }
  return targets;
}
