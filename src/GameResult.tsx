import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Color } from 'chess.js';
import { ArrowRight, Handshake, LoaderCircle, RotateCcw, Trophy } from 'lucide-react';

export interface ResultPresentation { kind: 'win' | 'loss' | 'draw'; title: string }
export function presentResult(outcome: string | null, player: Color | null): ResultPresentation | null {
  if (!outcome) return null;
  if (outcome.startsWith('Draw')) return { kind: 'draw', title: 'An even finish.' };
  const winner = /^(White|Black) wins\b/.exec(outcome)?.[1];
  if (!winner) return null;
  const won = player === null || (winner === 'White' ? 'w' : 'b') === player;
  return { kind: won ? 'win' : 'loss', title: player === null ? `${winner} wins!` : won ? 'You won!' : 'You lost this one.' };
}

export function BoardConfetti({ gameId }: { gameId: string }) {
  const [running, setRunning] = useState(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try { return !sessionStorage.getItem(`knight-club-celebrated:${gameId}`); } catch { return true; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(`knight-club-celebrated:${gameId}`, '1'); } catch { /* Optional visual preference. */ }
    const timer = setTimeout(() => setRunning(false), 4200);
    return () => clearTimeout(timer);
  }, [gameId]);
  if (!running) return null;
  return <div className="board-confetti" aria-hidden="true">{Array.from({ length: 64 }, (_, i) => <i key={i} style={{
    '--confetti-x': `${(i * 47 + 3) % 100}%`, '--confetti-drift': `${(i * 37) % 160 - 80}px`,
    '--confetti-delay': `${(i % 9) * .075}s`, '--confetti-duration': `${2.5 + (i % 7) * .13}s`,
    '--confetti-spin': `${90 + (i * 97) % 720}deg`, '--confetti-color': ['var(--green)', '#f2d27a', '#e4efe2', '#8cbad1'][i % 4],
  } as CSSProperties} />)}</div>;
}

export function GameResult({ result, outcome, color, onPlayAgain, onReview, onDecline, pending, reviewDisabled, rematch, opponent }: {
  result: ResultPresentation; outcome: string; color: Color; onPlayAgain: () => void; onReview: () => void;
  onDecline: () => void; pending: boolean; reviewDisabled: boolean; rematch: 'none' | 'sent' | 'received'; opponent: string;
}) {
  return <section className={`game-result result-${result.kind}`} aria-label="Game result">
    <div className="result-heading">
      <div className="result-icon" aria-hidden="true">{result.kind === 'win' ? <Trophy size={29} /> : result.kind === 'loss' ? <><span className="king-rest" /><img className="fallen-king" src={`/pieces/${color}K.svg`} alt="" /></> : <Handshake size={29} />}</div>
      <div aria-live="polite"><h2>{result.title}</h2><p>{outcome}</p></div>
    </div>
    <p className="result-rematch-note" role={rematch === 'none' ? undefined : 'status'}>{rematch === 'received' ? `${opponent} wants to play again. Colors will switch.` : rematch === 'sent' ? `Rematch requested. Waiting for ${opponent}…` : result.kind === 'loss' ? 'The next game is a fresh start.' : result.kind === 'draw' ? 'Another game to settle it?' : 'Well played. Ready for another?'}</p>
    <div className="result-actions"><button className="primary-button" disabled={pending || rematch === 'sent'} onClick={onPlayAgain}>{pending ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />}{rematch === 'received' ? 'Accept rematch' : rematch === 'sent' ? 'Rematch requested' : 'Play again'}</button>
      {rematch === 'received' ? <button className="secondary-button" disabled={pending} onClick={onDecline}>Decline</button> : <button className="secondary-button" disabled={reviewDisabled} onClick={onReview}>Review game<ArrowRight size={15} /></button>}
    </div>
  </section>;
}
