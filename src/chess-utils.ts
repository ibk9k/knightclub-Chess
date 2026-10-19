import { Chess } from 'chess.js';
import type { Color, Move } from 'chess.js';

export type Quality = 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
export interface Evaluation { cp: number; mate: number | null; bestMove: string; pv: string[]; depth: number }
export interface MoveRecord { san: string; uci: string; before: string; after: string; color: Color; quality?: Quality; loss?: number; evaluation?: Evaluation; bestSan?: string }
export const START_FEN = new Chess().fen();
export const QUALITY_SYMBOL: Record<Quality, string> = { Best: '★', Excellent: '!', Good: '✓', Inaccuracy: '?!', Mistake: '?', Blunder: '??' };
export const BOTS = [
  { id: 'nova', name: 'Nova', rating: '400', label: 'Beginner', emoji: '🤖', color: 'lavender', skill: 0, depth: 2, time: 100, quote: 'New to the board? Me too. Let’s figure it out together.', blurb: 'A friendly first opponent. Expect a few surprises, and a few mistakes.' },
  { id: 'milo', name: 'Milo', rating: '800', label: 'Casual', emoji: '🦊', color: 'orange', skill: 2, depth: 4, time: 160, quote: 'A little curious. A little crafty. Your move!', blurb: 'A curious opponent who knows the basics. A little practice goes a long way.' },
  { id: 'cleo', name: 'Cleo', rating: '1200', label: 'Intermediate', emoji: '🐱', color: 'rose', skill: 5, depth: 7, time: 250, quote: 'I see you eyeing that knight. Good instincts.', blurb: 'Comfortable with tactics and always looking for an opportunity.' },
  { id: 'atlas', name: 'Atlas', rating: '1600', label: 'Advanced', emoji: '🐻', color: 'brown', skill: 10, depth: 10, time: 400, quote: 'A strong position is built one move at a time.', blurb: 'A steady strategist with sharp tactics. Bring your best ideas.' },
  { id: 'iris', name: 'Iris', rating: '2000', label: 'Expert', emoji: '🦉', color: 'blue', skill: 15, depth: 13, time: 650, quote: 'Look a little deeper. There’s always another idea.', blurb: 'Patient, precise, and difficult to surprise. A serious challenge.' },
  { id: 'stockfish', name: 'Stockfish', rating: '2800+', label: 'Master', emoji: '🐟', color: 'mint', skill: 20, depth: 18, time: 1200, quote: 'Let the position speak for itself.', blurb: 'The engine at full strength. How long can you hold your ground?' },
] as const;
export type Bot = typeof BOTS[number];

export function uci(move: Move): string { return move.from + move.to + (move.promotion || ''); }
export function makeUci(chess: Chess, text: string): Move | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(text)) return null;
  try { return chess.move({ from: text.slice(0, 2), to: text.slice(2, 4), promotion: text[4] || 'q' }); } catch { return null; }
}
export function toSan(fen: string, text: string): string { return makeUci(new Chess(fen), text)?.san || text; }
export function pvToSan(fen: string, pv: string[], limit = 5): string[] {
  const c = new Chess(fen), moves: string[] = [];
  for (const u of pv.slice(0, limit)) { const move = makeUci(c, u); if (!move) break; moves.push(move.san); }
  return moves;
}
export function classifyMove(before: Evaluation, after: Evaluation, color: Color, played: string): { quality: Quality; loss: number } {
  const direction = color === 'w' ? 1 : -1;
  const loss = Math.max(0, (before.cp - after.cp) * direction);
  if (before.bestMove === played) return { quality: 'Best', loss };
  if (loss < 25) return { quality: 'Excellent', loss };
  if (loss < 65) return { quality: 'Good', loss };
  if (loss < 130) return { quality: 'Inaccuracy', loss };
  if (loss < 250) return { quality: 'Mistake', loss };
  return { quality: 'Blunder', loss };
}
export function explainMove(record: MoveRecord): string {
  const c = new Chess(record.after);
  if (c.isCheckmate()) return 'Checkmate! Your pieces worked together to finish the game.';
  const move = new Chess(record.before).moves({ verbose: true }).find(m => uci(m) === record.uci);
  if (!record.quality) return 'Stockfish is taking a closer look at this move.';
  if (['Inaccuracy', 'Mistake', 'Blunder'].includes(record.quality)) {
    return `${record.bestSan ? `${record.bestSan} was stronger. ` : ''}This move gives up ${(record.loss! / 100).toFixed(1)} pawns of engine evaluation. Look for your opponent’s threats before committing.`;
  }
  if (move?.isKingsideCastle() || move?.isQueensideCastle()) return 'Your king is safer and your rook joins the action. A useful step toward connecting your pieces.';
  if (move?.isPromotion()) return 'A new piece joins the board. Your passed pawn has paid off.';
  if (c.isCheck()) return 'You’re giving check and asking your opponent to respond. Keep looking for forcing moves.';
  if (move?.isCapture()) return 'A well-judged capture. You’ve kept the position working in your favor.';
  if (move?.piece === 'n' || move?.piece === 'b') return 'Your piece finds a useful square. Active pieces create more options for your next move.';
  if (move?.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) return 'You’re claiming space in the center and opening lines for your pieces. A solid foundation.';
  return record.quality === 'Best' ? 'Stockfish’s top choice. This move makes the most of the position in front of you.' : 'A sound move that keeps your position on track. Keep an eye on piece activity and king safety.';
}
export function gameOutcome(c: Chess): string | null {
  if (c.isCheckmate()) return `${c.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`;
  if (c.isStalemate()) return 'Draw by stalemate';
  if (c.isThreefoldRepetition()) return 'Draw by threefold repetition';
  if (c.isInsufficientMaterial()) return 'Draw by insufficient material';
  if (c.isDraw()) return 'Draw by the fifty-move rule';
  return null;
}
export function clockText(ms: number): string { const sec = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
export function evalText(e?: Evaluation | null): string { if (!e) return '0.0'; if (e.mate !== null) return `${e.cp > 0 ? '+' : '−'}M${Math.abs(e.mate)}`; return `${e.cp > 0 ? '+' : ''}${(e.cp / 100).toFixed(1)}`; }
export function openingName(records: MoveRecord[]): string {
  const moves = records.map(m => m.san).join(' ');
  if (moves.startsWith('e4 e5 Nf3 Nc6 Bb5')) return 'Ruy Lopez';
  if (moves.startsWith('e4 e5 Nf3 Nc6 Bc4')) return 'Italian Game';
  if (moves.startsWith('e4 c5')) return 'Sicilian Defense';
  if (moves.startsWith('e4 e6')) return 'French Defense';
  if (moves.startsWith('e4 c6')) return 'Caro–Kann Defense';
  if (moves.startsWith('d4 d5 c4')) return 'Queen’s Gambit';
  if (moves.startsWith('d4 Nf6')) return 'Indian Defense';
  if (moves.startsWith('e4 e5')) return 'Open Game';
  if (moves.startsWith('e4')) return 'King’s Pawn Opening';
  if (moves.startsWith('d4')) return 'Queen’s Pawn Opening';
  if (moves.startsWith('Nf3')) return 'Réti Opening';
  if (moves.startsWith('c4')) return 'English Opening';
  return records.length ? 'Custom opening' : 'The opening is yours';
}
