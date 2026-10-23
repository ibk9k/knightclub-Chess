import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import { ArrowDownUp, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Flame, Lightbulb, RotateCcw, Search, Target, Trophy } from 'lucide-react';
import { BoardConfetti } from './GameResult';
import { explainIllegalMove } from './move-rules';
import { usePieceDrag } from './use-piece-drag';
import { toSan } from './chess-utils';
import { PUZZLES, PUZZLE_STORAGE_KEY, PUZZLE_THEMES, attemptPuzzleMove, completePuzzle, dailyPuzzle, difficulty, localDate, mergeProgress, parseProgress, puzzleLine, puzzleNumber, puzzleReply, puzzleTitle, startPuzzle, streakFor, themeFor } from './puzzles';
import type { Puzzle, PuzzleAttempt, PuzzleProgress, PuzzleTheme } from './puzzles';
import './puzzles.css';

const pieceNames: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function MiniBoard({ puzzle }: { puzzle: Puzzle }) {
  const game = useMemo(() => new Chess(puzzle.fen), [puzzle]);
  const flipped = game.turn() === 'b';
  return <span className="puzzle-mini-board" aria-hidden="true">{Array.from({ length: 64 }, (_, i) => {
    const file = flipped ? 7 - i % 8 : i % 8, rank = flipped ? Math.floor(i / 8) + 1 : 8 - Math.floor(i / 8);
    const piece = game.get(`${'abcdefgh'[file]}${rank}` as Square);
    return <span key={i} className={(file + rank) % 2 ? 'light' : 'dark'}>{piece && <img src={`/pieces/${piece.color}${piece.type.toUpperCase()}.svg`} alt="" loading="lazy" draggable={false} />}</span>;
  })}</span>;
}

function PuzzleSolver({ puzzle, daily, alreadySolved, showLegal, onSolved, onNext, onSound }: {
  puzzle: Puzzle; daily: boolean; alreadySolved: boolean; showLegal: boolean;
  onSolved: (attempt: PuzzleAttempt) => void; onNext: () => void; onSound: (capture: boolean) => void;
}) {
  const [attempt, setAttempt] = useState(() => startPuzzle(puzzle));
  const attemptRef = useRef(attempt);
  const update = (next: PuzzleAttempt) => { attemptRef.current = next; setAttempt(next); };
  const [selected, setSelected] = useState<Square | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [review, setReview] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [flipped, setFlipped] = useState(() => new Chess(puzzle.fen).turn() === 'b');
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [lastMove, setLastMove] = useState(puzzle.setup);
  const promotionRef = useRef<HTMLDialogElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const line = useMemo(() => puzzleLine(puzzle), [puzzle]);
  const fen = review === null ? attempt.fen : review === 0 ? puzzle.fen : line[review - 1].after;
  const position = useMemo(() => new Chess(fen), [fen]);
  const player = new Chess(puzzle.fen).turn(), color = player === 'w' ? 'White' : 'Black';
  const playing = review === null && attempt.status === 'playing' && !promotion;
  const expected = puzzle.moves[attempt.index];
  const legalMoves = selected && playing ? position.moves({ square: selected, verbose: true }) : [];
  const shownLast = review === null ? lastMove : review === 0 ? puzzle.setup : line[review - 1].uci;
  const opponentLast = line[Math.floor((review ?? attempt.index) / 2) * 2 - 1]?.san || puzzle.lastMove;
  const goal = puzzle.themes.includes('mate') ? 'Find the checkmate' : 'Find the winning sequence';

  useEffect(() => {
    if (attempt.status !== 'replying') return;
    const timer = setTimeout(() => {
      const next = puzzleReply(puzzle, attemptRef.current);
      setLastMove(puzzle.moves[attemptRef.current.index]);
      const before = new Chess(attemptRef.current.fen), reply = puzzle.moves[attemptRef.current.index];
      onSound(!!before.get(reply.slice(2, 4) as Square) || before.get(reply.slice(0, 2) as Square)?.type === 'p' && reply[0] !== reply[2]);
      update(next); setFeedback('Good move. Keep going!'); setError(false);
    }, 420);
    return () => clearTimeout(timer);
  }, [attempt.status, puzzle]);
  useEffect(() => { if (promotion) promotionRef.current?.showModal(); else promotionRef.current?.close(); }, [promotion]);
  useEffect(() => { if (hintLevel > 0 && matchMedia('(max-width: 760px)').matches) hintRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [hintLevel]);

  const play = (from: Square, to: Square, piece: PieceSymbol = 'q') => {
    if (review !== null || attemptRef.current.status !== 'playing') return;
    const before = new Chess(attemptRef.current.fen);
    const result = attemptPuzzleMove(puzzle, attemptRef.current, from + to + (before.get(from)?.type === 'p' && ['1', '8'].includes(to[1]) ? piece : ''));
    setSelected(null); setPromotion(null);
    if (result.kind === 'illegal') { setFeedback(explainIllegalMove(before, from, to) || 'That move isn’t legal. Try another square.'); setError(true); return; }
    update(result.attempt);
    if (result.kind === 'incorrect') { setFeedback('That move is legal, but there’s a stronger continuation. Try again.'); setError(true); return; }
    setLastMove(from + to); setHintLevel(0); setError(false);
    onSound(!!before.get(to) || before.get(from)?.type === 'p' && from[0] !== to[0]);
    setFeedback(result.kind === 'solved' ? 'Puzzle solved. Well played!' : 'That’s it! Your opponent is replying…');
    if (result.kind === 'solved') onSolved(result.attempt);
  };
  const tryMove = (from: Square, to: Square) => {
    if (!playing) return;
    if (position.moves({ square: from, verbose: true }).some(move => move.to === to && move.promotion)) { setPromotion({ from, to }); return; }
    play(from, to);
  };
  const onSquare = (square: Square) => {
    if (!playing) return;
    const piece = position.get(square);
    if (piece?.color === player) { setSelected(selected === square ? null : square); return; }
    if (selected) tryMove(selected, square);
  };
  const drag = usePieceDrag({ positionKey: `${fen}:${flipped}:${review}:${attempt.status}:${promotion?.from}`, onSelect: setSelected, onDrop: tryMove });
  const giveHint = () => {
    if (!playing || hintLevel >= 3) return;
    setHintLevel(level => level + 1); update({ ...attemptRef.current, hints: attemptRef.current.hints + 1 });
  };
  const openSolution = () => { drag.cancel(); setSelected(null); setPromotion(null); setReview(0); if (attempt.status !== 'solved') setRevealed(true); };
  const retry = () => { drag.cancel(); update(startPuzzle(puzzle)); setReview(null); setRevealed(false); setSelected(null); setPromotion(null); setHintLevel(0); setFeedback('A fresh look. Find the winning move.'); setError(false); setLastMove(puzzle.setup); };
  const hintPiece = expected ? position.get(expected.slice(0, 2) as Square) : null;
  const hintText = hintLevel === 1 ? themeFor(puzzle).hint : hintLevel === 2 ? `Look at your ${hintPiece ? pieceNames[hintPiece.type] : 'piece'} on ${expected?.slice(0, 2)}.` : hintLevel === 3 && expected ? `Try ${toSan(attempt.fen, expected)}: ${expected.slice(0, 2)} → ${expected.slice(2, 4)}${expected[4] ? `, promoting to a ${pieceNames[expected[4] as PieceSymbol]}` : ''}.` : '';

  return <div className="puzzle-play-layout">
    <section className="puzzle-board-column" aria-label="Puzzle board">
      <div className="puzzle-player"><span className={`side-dot ${player}`} /><strong>{color} to play</strong><span>{review !== null ? 'Solution review' : attempt.status === 'solved' ? 'Solved' : 'Take your time · no clock'}</span></div>
      <div className="board puzzle-board" role="group" aria-label="Puzzle chessboard" onClickCapture={event => { if (drag.suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }} onContextMenu={event => { event.preventDefault(); drag.cancel(); setSelected(null); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { drag.cancel(); setSelected(null); }
          const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
          if (event.key in offsets) {
            const squares = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-square]')];
            const index = squares.indexOf(event.target as HTMLButtonElement), next = index + offsets[event.key];
            if (index >= 0 && next >= 0 && next < 64) { event.preventDefault(); squares[next].focus(); }
          }
        }}>
        {Array.from({ length: 64 }, (_, i) => {
          const row = Math.floor(i / 8), col = i % 8, file = flipped ? 7 - col : col, rank = flipped ? row + 1 : 8 - row;
          const square = `${'abcdefgh'[file]}${rank}` as Square, piece = position.get(square);
          const legal = legalMoves.some(move => move.to === square), movable = playing && piece?.color === player;
          const hinted = playing && hintLevel >= 2 && square === expected?.slice(0, 2) || playing && hintLevel >= 3 && square === expected?.slice(2, 4);
          return <button key={square} type="button" data-square={square} data-movable={movable || undefined} draggable={false} aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${pieceNames[piece.type]}` : ''}${legal ? ' legal destination' : ''}`} aria-pressed={selected === square}
            className={`square ${(file + rank) % 2 ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${[shownLast.slice(0, 2), shownLast.slice(2, 4)].includes(square) ? 'last-move' : ''} ${hinted ? 'hint-square' : ''} ${piece?.type === 'k' && piece.color === position.turn() && position.isCheck() ? 'check-square' : ''} ${drag.piece?.from === square ? 'drag-source' : ''} ${drag.piece?.over === square ? 'drag-over' : ''}`}
            onClick={() => onSquare(square)} onDragStart={event => event.preventDefault()} onPointerDown={event => { if (movable && piece) drag.start(event, square, `/pieces/${piece.color}${piece.type.toUpperCase()}.svg`); }}>
            {col === 0 && <span className="coordinate rank">{rank}</span>}{row === 7 && <span className="coordinate file">{'abcdefgh'[file]}</span>}
            {piece && <img className="piece" src={`/pieces/${piece.color}${piece.type.toUpperCase()}.svg`} alt="" draggable={false} />}
            {showLegal && legal && <span className={piece ? 'legal-capture' : 'legal-dot'} />}
          </button>;
        })}
        {attempt.status === 'solved' && review === null && <BoardConfetti gameId={`puzzle:${puzzle.id}`} />}
      </div>
      <div className={`puzzle-mobile-status ${error ? 'is-error' : ''} ${attempt.status === 'solved' ? 'is-success' : ''}`} role="status" aria-live="polite">{review !== null ? 'Step through the solution below.' : feedback || `${goal}.`}</div>
      <div className="puzzle-board-tools"><span>Opponent’s last move: <strong>{opponentLast}</strong></span><button className="puzzle-mobile-hint text-button" disabled={!playing || hintLevel >= 3} onClick={giveHint}><Lightbulb size={15} />Hint</button><button className="icon-button" aria-label="Flip puzzle board" title="Flip board" onClick={() => setFlipped(value => !value)}><ArrowDownUp size={17} /></button></div>
      {drag.piece && <img ref={drag.imageRef} className="drag-piece" src={drag.piece.image} alt="" aria-hidden="true" draggable={false} style={{ left: drag.piece.x, top: drag.piece.y, width: drag.piece.size, height: drag.piece.size }} />}
    </section>
    <aside className="puzzle-companion" aria-label="Puzzle challenge">
      <div className="puzzle-challenge-label"><Target size={17} /><span>{daily ? 'Daily challenge' : puzzleTitle(puzzle)}</span><span className={`puzzle-level level-${difficulty(puzzle).toLowerCase()}`}>{difficulty(puzzle)}</span></div>
      <h2>{attempt.status === 'solved' ? 'You found it.' : review !== null ? 'Follow the idea.' : goal + '.'}</h2>
      <p className="puzzle-instruction">{attempt.status === 'solved' ? `${attempt.hints ? 'A little help, a new idea learned.' : 'Good calculation. That’s a tactic to remember.'} ${daily ? 'Your daily challenge is complete.' : 'Ready for another challenge?'}` : review !== null ? 'Step through the winning line. Your moves and the opponent’s best replies are shown below.' : `${color} has a winning idea. Play the full sequence; we’ll make the opponent’s replies.`}</p>
      <div className={`puzzle-feedback ${error ? 'is-error' : ''} ${attempt.status === 'solved' ? 'is-success' : ''}`} role="status" aria-live="polite" aria-atomic="true">
        {attempt.status === 'solved' ? <Trophy size={20} /> : error ? <RotateCcw size={19} /> : <span className={`side-dot ${player}`} />}
        <span>{review !== null ? revealed ? 'Solution revealed · solve it yourself to record a completion.' : 'Review your winning sequence.' : feedback || (alreadySolved ? 'You’ve solved this one before. Try it again!' : `Your move. You’re playing ${color.toLowerCase()}.`)}</span>
      </div>
      {review === null && attempt.status !== 'solved' && <>
        <div className="puzzle-step-progress" aria-label={`${Math.ceil(attempt.index / 2)} of ${Math.ceil(puzzle.moves.length / 2)} moves found`}>{Array.from({ length: Math.ceil(puzzle.moves.length / 2) }, (_, i) => <span key={i} className={i < Math.ceil(attempt.index / 2) ? 'done' : ''}><i>{i < Math.ceil(attempt.index / 2) ? <Check size={12} /> : i + 1}</i>{i === 0 ? 'Find the move' : 'Continue'}</span>)}</div>
        {hintLevel > 0 && <div ref={hintRef} className="puzzle-hint" role="status"><Lightbulb size={18} /><div><strong>Hint {hintLevel} of 3</strong><p>{hintText}</p></div></div>}
        <button className="secondary-button puzzle-hint-button" disabled={!playing || hintLevel >= 3} onClick={giveHint}><Lightbulb size={17} />{hintLevel === 0 ? 'Give me a hint' : hintLevel === 3 ? 'Move revealed' : 'A little more help'}<span>{Math.min(hintLevel + 1, 3)}/3</span></button>
        <p className="puzzle-hint-note">Hints are welcome. They still count toward your daily streak.</p>
      </>}
      {review !== null && <div className="puzzle-solution">
        <div className="puzzle-solution-controls"><button className="icon-button" aria-label="Previous solution move" disabled={review === 0} onClick={() => setReview(review - 1)}><ChevronLeft size={19} /></button><span>{review === 0 ? 'Starting position' : `${review} / ${line.length}`}</span><button className="icon-button" aria-label="Next solution move" disabled={review === line.length} onClick={() => setReview(review + 1)}><ChevronRight size={19} /></button></div>
        <ol>{line.map((move, i) => <li key={i}><button className={review === i + 1 ? 'active' : ''} aria-current={review === i + 1 ? 'step' : undefined} onClick={() => setReview(i + 1)}><span>{move.color === player ? 'You' : 'Reply'}</span><strong>{move.san}</strong><ChevronRight size={14} /></button></li>)}</ol>
      </div>}
      {(attempt.status === 'solved' || review !== null) && <div className="puzzle-learned"><strong>{themeFor(puzzle).label}</strong><p>{themeFor(puzzle).hint}</p></div>}
      <div className="puzzle-actions">{attempt.status === 'solved' || review !== null ? <><button className="primary-button" onClick={onNext}>Next challenge <ArrowRight size={17} /></button><button className="text-button" onClick={retry}><RotateCcw size={15} />Try again</button></> : <button className="text-button" onClick={onNext}>Skip for now <ArrowRight size={15} /></button>}
        {review === null && <button className="text-button" disabled={attempt.status === 'replying'} onClick={openSolution}>{attempt.status === 'solved' ? 'Review solution' : 'View solution'}</button>}
      </div>
      {attempt.status !== 'solved' && review === null && <p className="puzzle-solution-note">Viewing the solution doesn’t record a solve or extend your streak.</p>}
      <div className="puzzle-source">Lichess puzzle #{puzzle.id} · rating {puzzle.rating}<a href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">Original puzzle ↗</a></div>
    </aside>
    <dialog ref={promotionRef} className="app-dialog puzzle-promotion" aria-label="Choose a promotion piece" onCancel={() => setPromotion(null)}><h2>Promote your pawn.</h2><p>Choose its new piece.</p><div>{(['q', 'r', 'b', 'n'] as PieceSymbol[]).map(piece => <button key={piece} aria-label={`Promote to ${pieceNames[piece]}`} onClick={() => promotion && play(promotion.from, promotion.to, piece)}><img src={`/pieces/${player}${piece.toUpperCase()}.svg`} alt="" draggable={false} /><span>{pieceNames[piece]}</span></button>)}</div><button className="text-button" onClick={() => setPromotion(null)}>Cancel</button></dialog>
  </div>;
}

export default function PuzzleHub({ showLegal, onSound }: { showLegal: boolean; onSound: (capture: boolean) => void }) {
  const [today, setToday] = useState(localDate);
  const daily = dailyPuzzle(today);
  const [active, setActive] = useState(() => PUZZLES.find(puzzle => puzzle.id === new URLSearchParams(location.search).get('puzzle')) || dailyPuzzle(localDate()));
  const [startedOn, setStartedOn] = useState(today);
  const [session, setSession] = useState(0);
  const [progress, setProgress] = useState(() => { try { return parseProgress(localStorage.getItem(PUZZLE_STORAGE_KEY)); } catch { return parseProgress(null); } });
  const [storageError, setStorageError] = useState(false);
  const [theme, setTheme] = useState('all'), [level, setLevel] = useState('all'), [status, setStatus] = useState('all'), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const solverRef = useRef<HTMLDivElement>(null);
  const streak = streakFor(progress, today), dailyDone = progress.daily.includes(today);
  useEffect(() => {
    const refresh = () => setToday(localDate());
    const storage = (event: StorageEvent) => { if (event.key === PUZZLE_STORAGE_KEY || event.key === null) setProgress(parseProgress(event.newValue)); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); window.addEventListener('storage', storage);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('storage', storage); };
  }, []);
  const recordSolve = (attempt: PuzzleAttempt) => {
    const date = localDate();
    let current: PuzzleProgress = progress;
    try { current = mergeProgress(current, parseProgress(localStorage.getItem(PUZZLE_STORAGE_KEY))); } catch { /* Memory progress still works. */ }
    const next = completePuzzle(current, active, date, attempt.hints, attempt.mistakes, startedOn);
    try { localStorage.setItem(PUZZLE_STORAGE_KEY, JSON.stringify(next)); setStorageError(false); } catch { setStorageError(true); }
    setProgress(next); setToday(date);
  };
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase().replace(/^#/, '');
    return PUZZLES.filter(puzzle => (theme === 'all' || puzzle.themes.includes(theme)) && (level === 'all' || difficulty(puzzle) === level) && (status === 'all' || (status === 'solved' ? !!progress.solved[puzzle.id] : !progress.solved[puzzle.id])) && (!search || `${puzzleTitle(puzzle)} ${puzzle.id} ${puzzle.themes.map(tag => PUZZLE_THEMES[tag as PuzzleTheme]?.label || tag).join(' ')}`.toLowerCase().includes(search)));
  }, [theme, level, status, query, progress]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12)), currentPage = Math.min(page, pageCount - 1);
  const selectPuzzle = (puzzle: Puzzle) => { setActive(puzzle); setStartedOn(localDate()); setSession(value => value + 1); solverRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); };
  const nextPuzzle = () => {
    const candidates = filtered.length ? filtered : PUZZLES;
    const index = candidates.findIndex(puzzle => puzzle.id === active.id);
    const ordered = [...candidates.slice(index + 1), ...candidates.slice(0, index + 1)].filter(puzzle => puzzle.id !== active.id);
    selectPuzzle(ordered.find(puzzle => !progress.solved[puzzle.id]) || ordered[0] || PUZZLES.find(puzzle => puzzle.id !== active.id)!);
  };
  const recentDays = Array.from({ length: 7 }, (_, i) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - 6 + i); return { key: localDate(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1) }; });

  return <div className="page-content puzzle-page">
    <div className="page-heading"><div><h1>A little sharper, every day.</h1><p>A quick daily puzzle. A whole catalogue of good ideas.</p></div><a className="puzzle-catalogue-jump" href="#puzzle-catalogue">Browse {PUZZLES.length} challenges <ArrowRight size={15} /></a></div>
    <section className="puzzle-daily-strip" aria-label="Daily puzzle progress">
      <div className="puzzle-daily-title"><CalendarDays size={23} /><div><strong>{dailyDone ? 'Today’s puzzle, solved.' : 'Your daily challenge awaits.'}</strong><span>{dateLabel(today)} · New puzzle at local midnight</span></div>{(active.id !== daily.id || startedOn !== today) && <button className="secondary-button" onClick={() => selectPuzzle(daily)}>{dailyDone ? 'Play again' : 'Play daily'}<ArrowRight size={15} /></button>}</div>
      <div className="puzzle-streak"><Flame size={23} /><div><strong>{streak.current} <span>day{streak.current === 1 ? '' : 's'}</span></strong><span>Daily streak · best {streak.best}</span></div></div>
      <ol className="puzzle-week" aria-label="Last seven days">{recentDays.map(day => <li key={day.key} className={`${progress.daily.includes(day.key) ? 'complete' : ''} ${day.key === today ? 'today' : ''}`} title={`${dateLabel(day.key)}: ${progress.daily.includes(day.key) ? 'solved' : 'not solved'}`}><span>{day.label}</span><i aria-label={`${dateLabel(day.key)} ${progress.daily.includes(day.key) ? 'solved' : 'not solved'}`}>{progress.daily.includes(day.key) ? <Check size={13} /> : <span />}</i></li>)}</ol>
    </section>
    <div ref={solverRef} className="puzzle-solver-anchor"><PuzzleSolver key={`${active.id}:${session}`} puzzle={active} daily={active.id === daily.id && startedOn === today} alreadySolved={!!progress.solved[active.id]} showLegal={showLegal} onSolved={recordSolve} onNext={nextPuzzle} onSound={onSound} /></div>
    <section id="puzzle-catalogue" className="puzzle-catalogue" aria-label="Challenge catalogue">
      <div className="puzzle-catalogue-heading"><div><h2>Find your next challenge.</h2><p>Checkmates, clever captures, and tactics worth knowing.</p></div><span><Check size={16} />{Object.keys(progress.solved).length} / {PUZZLES.length} solved</span></div>
      <div className="puzzle-filters"><label className="puzzle-search"><span className="sr-only">Search challenges</span><Search size={17} /><input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Search themes or challenge #" /></label><label>Theme<select aria-label="Theme" value={theme} onChange={event => { setTheme(event.target.value); setPage(0); }}><option value="all">All themes</option>{Object.entries(PUZZLE_THEMES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><label>Difficulty<select aria-label="Difficulty" value={level} onChange={event => { setLevel(event.target.value); setPage(0); }}><option value="all">All levels</option>{['Easy', 'Medium', 'Hard'].map(value => <option key={value}>{value}</option>)}</select></label><label>Progress<select aria-label="Progress" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">All challenges</option><option value="unsolved">Unsolved</option><option value="solved">Solved</option></select></label></div>
      <div className="puzzle-catalogue-summary" role="status"><span>{filtered.length} challenge{filtered.length === 1 ? '' : 's'}{theme !== 'all' ? ` · ${PUZZLE_THEMES[theme as PuzzleTheme].label}` : ''}</span>{(theme !== 'all' || level !== 'all' || status !== 'all' || query) && <button className="text-button" onClick={() => { setTheme('all'); setLevel('all'); setStatus('all'); setQuery(''); setPage(0); }}>Clear filters</button>}</div>
      <div className="puzzle-catalogue-list">{filtered.slice(currentPage * 12, currentPage * 12 + 12).map(puzzle => <button className={`puzzle-catalogue-row ${active.id === puzzle.id ? 'active' : ''}`} key={puzzle.id} aria-label={`Play ${puzzleTitle(puzzle)}, ${themeFor(puzzle).label}, ${difficulty(puzzle)}${progress.solved[puzzle.id] ? ', solved' : ''}`} aria-current={active.id === puzzle.id ? 'true' : undefined} onClick={() => selectPuzzle(puzzle)}><MiniBoard puzzle={puzzle} /><span className="puzzle-row-title"><span>Challenge {puzzleNumber(puzzle)}{puzzle.id === daily.id && <span className="puzzle-today-tag">Today’s daily</span>}</span><strong>{themeFor(puzzle).label}</strong><span>{Math.ceil(puzzle.moves.length / 2)} move{puzzle.moves.length > 2 ? 's' : ''} to find</span></span><span className={`puzzle-level level-${difficulty(puzzle).toLowerCase()}`}>{difficulty(puzzle)}</span><span className={`puzzle-row-status ${progress.solved[puzzle.id] ? 'solved' : ''}`}>{progress.solved[puzzle.id] ? <><Check size={15} />Solved{progress.solved[puzzle.id].assisted ? ' with help' : ''}</> : 'Unsolved'}</span><ChevronRight size={18} /></button>)}</div>
      {!filtered.length && <div className="puzzle-empty"><Search size={27} /><strong>No challenges match those filters.</strong><p>Try another theme or clear your filters to see the full catalogue.</p></div>}
      {filtered.length > 12 && <div className="puzzle-pagination"><span>{currentPage * 12 + 1}–{Math.min((currentPage + 1) * 12, filtered.length)} of {filtered.length}</span><div><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} />Previous</button><span>{currentPage + 1} / {pageCount}</span><button className="secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={16} /></button></div></div>}
    </section>
    <footer className="puzzle-footer"><span>{storageError ? 'Browser storage is unavailable. Progress lasts for this visit.' : 'Progress and streaks are saved on this device.'}</span><span>Puzzles from the <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">Lichess open database · CC0 ↗</a></span></footer>
  </div>;
}
