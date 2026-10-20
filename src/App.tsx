import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CircleHelp, Clock3, Cpu, Download, Flag, Gamepad2, Heart, History, Lightbulb, LoaderCircle, Menu, MoreHorizontal, Play, RotateCcw, Settings2, ShieldCheck, Sparkles, Swords, Target, Trophy, Upload, Users, Volume2, VolumeX, X } from 'lucide-react';
import { StockfishEngine } from './engine';
import { useLiveAnalysis } from './use-live-analysis';
import { BOTS, QUALITY_SYMBOL, START_FEN, classifyMove, clockText, evalText, explainMove, gameOutcome, makeUci, materialAdvantage, openingName, pvToSan, toSan, uci } from './chess-utils';
import type { Bot, Evaluation, MoveRecord, Quality } from './chess-utils';
import { useOnlineGame } from './use-online-game';
import { OnlinePanel } from './OnlinePanel';
import { BoardConfetti, GameResult, presentResult } from './GameResult';

type Mode = 'bot' | 'local' | 'analysis' | 'online';
type DialogType = 'new' | 'import' | 'settings' | 'help' | 'resign' | 'games' | null;
interface SavedGame { id: string; date: string; bot: string; pgn: string; result: string; moves: number }
const pieceNames: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const timeOptions = [{ value: 0, label: 'No clock' }, { value: 3, label: '3 min' }, { value: 5, label: '5 min' }, { value: 10, label: '10 min' }, { value: 15, label: '15 min' }, { value: 30, label: '30 min' }];

function KnightMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 44" fill="currentColor" aria-hidden="true"><path d="M7 37h27v4H7zM10 34c0-8 8-10 10-15l-7 4-7-4 8-11 1-6 7 4c10 2 14 11 10 22l-1 6H10z" /><circle cx="20" cy="12" r="1.6" fill="var(--sidebar)" /></svg>;
}

function Avatar({ bot, large = false }: { bot: Bot; large?: boolean }) {
  return <div className={`avatar ${bot.color} ${large ? 'large' : ''}`} aria-hidden="true"><span>{bot.emoji}</span></div>;
}

function App() {
  const game = useRef(new Chess());
  const [records, setRecords] = useState<MoveRecord[]>([]);
  const [fen, setFen] = useState(START_FEN);
  const [initialFen, setInitialFen] = useState(START_FEN);
  const [bot, setBot] = useState<Bot>(BOTS[1]);
  const [selectedBot, setSelectedBot] = useState<Bot>(BOTS[1]);
  const [mode, setMode] = useState<Mode>('bot');
  const [side, setSide] = useState<Color>('w');
  const [chosenSide, setChosenSide] = useState<'w' | 'b' | 'random'>('w');
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<'game' | 'analysis'>('analysis');
  const [selected, setSelected] = useState<Square | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [engineStatus, setEngineStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [engineMessage, setEngineMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogType>(null);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [sound, setSound] = useState(true);
  const [showLegal, setShowLegal] = useState(true);
  const [coach, setCoach] = useState(true);
  const [boardTheme, setBoardTheme] = useState('club');
  const [timeControl, setTimeControl] = useState(0);
  const [activeTimeControl, setActiveTimeControl] = useState(0);
  const [clocks, setClocks] = useState({ w: 0, b: 0 });
  const [mobileNav, setMobileNav] = useState(false);
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => { try { return JSON.parse(localStorage.getItem('knight-club-games') || '[]'); } catch { return []; } });
  const engine = useRef<StockfishEngine | null>(null);
  const generation = useRef(0);
  const evaluations = useRef(new Map<string, Evaluation>());
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;
  const savedId = useRef<string | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moveListRef = useRef<HTMLDivElement>(null);
  const [engineRetry, setEngineRetry] = useState(0);
  const gameStarted = records.length > 0;
  const online = useOnlineGame();
  const syncedOnline = useRef({ code: '', version: -1, round: 0 });
  const localGameId = useRef(crypto.randomUUID());
  const onlineInProgress = mode === 'online' && online.room?.status === 'active';

  useEffect(() => {
    if (new URLSearchParams(location.search).has('join')) { setMode('online'); setTab('game'); }
  }, []);
  useEffect(() => { if (online.restoring) { setMode('online'); setTab('game'); } }, [online.restoring]);

  useEffect(() => {
    const room = online.room;
    if (!room || (syncedOnline.current.code === room.code && syncedOnline.current.version === room.version)) return;
    const newRoom = syncedOnline.current.code !== room.code || syncedOnline.current.round !== room.round;
    if (!newRoom && game.current.fen() === room.fen && outcomeRef.current === room.outcome) {
      syncedOnline.current = { code: room.code, version: room.version, round: room.round }; return;
    }
    const chess = new Chess();
    const nextRecords: MoveRecord[] = [];
    for (const text of room.moves) {
      const move = makeUci(chess, text);
      if (!move) return;
      nextRecords.push({ san: move.san, uci: text, before: move.before, after: move.after, color: move.color });
    }
    if (nextRecords.length > recordsRef.current.length && !newRoom) playSound(!!chess.history({ verbose: true }).at(-1)?.captured);
    syncedOnline.current = { code: room.code, version: room.version, round: room.round };
    generation.current++; game.current = chess; setMode('online'); setInitialFen(START_FEN);
    setFen(chess.fen()); setRecords(nextRecords); setSide(room.seat); setOutcome(room.outcome); outcomeRef.current = room.outcome;
    setActiveTimeControl(room.timeControl); setSelected(null); setPromotion(null); setHint(null); setBusy(false); setReviewing(false);
    if (newRoom) { setFlipped(room.seat === 'b'); setReviewIndex(null); setTab('game'); savedId.current = null; }
  }, [online.room]);

  useEffect(() => {
    if (mode !== 'online' || !online.room) return;
    const room = online.room;
    const update = () => {
      const next = { ...room.clocks };
      const turn = room.fen.split(' ')[1] as Color;
      if (room.clockRunning) next[turn] = Math.max(0, next[turn] - (Date.now() - online.receivedAt.current));
      setClocks(next);
    };
    update(); const timer = setInterval(update, 200); return () => clearInterval(timer);
  }, [mode, online.room]);

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);

  useEffect(() => {
    const current = new StockfishEngine();
    engine.current = current;
    let mounted = true;
    setEngineStatus('loading');
    current.loaded().then(() => {
      if (!mounted) return;
      setEngineStatus('ready'); setEngineMessage('');
    }).catch(error => { if (mounted) { setEngineStatus('error'); setEngineMessage(error.message); } });
    return () => { mounted = false; current.terminate(); };
  }, [engineRetry]);

  useEffect(() => {
    if (dialog && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    if (!dialog && dialogRef.current?.open) dialogRef.current.close();
  }, [dialog]);

  useEffect(() => { if (moveListRef.current && reviewIndex === null) moveListRef.current.scrollTop = moveListRef.current.scrollHeight; }, [records.length, reviewIndex]);

  useEffect(() => {
    if (!activeTimeControl || mode === 'analysis' || mode === 'online' || !gameStarted || outcome) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), elapsed = now - last; last = now;
      const turn = game.current.turn();
      setClocks(prev => ({ ...prev, [turn]: Math.max(0, prev[turn] - elapsed) }));
    }, 200);
    return () => clearInterval(timer);
  }, [activeTimeControl, mode, gameStarted, outcome]);

  useEffect(() => {
    if (!activeTimeControl || mode === 'analysis' || mode === 'online' || outcome) return;
    if (clocks.w <= 0 || clocks.b <= 0) { generation.current++; setBusy(false); setOutcome(`${clocks.w <= 0 ? 'Black' : 'White'} wins on time`); }
  }, [clocks, activeTimeControl, mode, outcome]);

  useEffect(() => {
    if (!outcome || !records.length || savedId.current) return;
    const id = crypto.randomUUID(); savedId.current = id;
    const saved: SavedGame = { id, date: new Date().toISOString(), bot: mode === 'bot' ? bot.name : mode === 'online' ? online.room?.players[side === 'w' ? 'b' : 'w'] || 'Online player' : 'Local game', pgn: buildPgn(), result: outcome, moves: records.length };
    setSavedGames(prev => { const next = [saved, ...prev].slice(0, 30); try { localStorage.setItem('knight-club-games', JSON.stringify(next)); } catch { /* storage can be disabled */ } return next; });
  }, [outcome]);

  const playSound = useCallback((capture = false) => {
    if (!sound) return;
    try {
      audioContext.current ||= new AudioContext();
      const context = audioContext.current; void context.resume();
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(capture ? 430 : 580, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(220, context.currentTime + 0.055);
      gain.gain.setValueAtTime(0.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.085);
      oscillator.start(); oscillator.stop(context.currentTime + 0.09);
    } catch { /* Audio is optional. */ }
  }, [sound]);

  const evaluate = useCallback(async (position: string) => {
    const cached = evaluations.current.get(position);
    if (cached) return cached;
    const terminal = new Chess(position);
    if (terminal.isGameOver()) {
      const result: Evaluation = { cp: terminal.isCheckmate() ? terminal.turn() === 'w' ? -10000 : 10000 : 0, mate: terminal.isCheckmate() ? 0 : null, bestMove: '(none)', pv: [], depth: 0 };
      evaluations.current.set(position, result);
      return result;
    }
    if (!engine.current) throw new Error('Stockfish is loading.');
    const result = await engine.current.search(position, { depth: 15, time: 600 });
    evaluations.current.set(position, result);
    return result;
  }, []);

  const handleEngineError = (error: unknown) => {
    setEngineStatus('error'); setEngineMessage(error instanceof Error ? error.message : 'Engine unavailable. Retry to continue.');
    setBusy(false); setReviewing(false);
  };

  const analyzeRecord = async (record: MoveRecord, token: number) => {
    const before = await evaluate(record.before);
    if (token !== generation.current) return;
    const after = await evaluate(record.after);
    if (token !== generation.current) return;
    const judgment = classifyMove(before, after, record.color, record.uci);
    const updated = { ...record, ...judgment, evaluation: after, bestSan: toSan(record.before, before.bestMove) };
    setRecords(prev => prev.map(r => r === record ? updated : r));
    return after;
  };

  const computerMove = async (token: number, opponent: Bot) => {
    if (token !== generation.current || game.current.isGameOver() || outcomeRef.current) return;
    const before = game.current.fen();
    const result = await engine.current!.search(before, { depth: opponent.depth, time: opponent.time, skill: opponent.skill });
    if (token !== generation.current || game.current.fen() !== before) return;
    // Beginner opponents intentionally explore legal alternatives, while stronger bots use Stockfish's skill-limited choice.
    let bestMove = result.bestMove;
    const legal = game.current.moves({ verbose: true });
    const adventurous = opponent.id === 'nova' ? 0.5 : opponent.id === 'milo' ? 0.2 : 0;
    if (Math.random() < adventurous && legal.length > 1) bestMove = uci(legal[Math.floor(Math.random() * legal.length)]);
    const move = makeUci(game.current, bestMove);
    if (!move) throw new Error('The engine returned an invalid move. Retry the engine.');
    const record: MoveRecord = { san: move.san, uci: uci(move), before, after: game.current.fen(), color: move.color };
    setRecords(prev => [...prev, record]); setFen(record.after); playSound(move.isCapture());
    const end = gameOutcome(game.current); if (end) setOutcome(end);
    await analyzeRecord(record, token);
  };

  useEffect(() => {
    if (engineStatus !== 'ready' || mode !== 'bot' || busy || reviewing || outcome || game.current.turn() === side) return;
    const token = generation.current;
    setBusy(true);
    void computerMove(token, bot).catch(error => { if (token === generation.current) handleEngineError(error); }).finally(() => { if (token === generation.current) setBusy(false); });
  }, [engineStatus, mode, busy, reviewing, outcome, fen, side]);

  const commitMove = async (from: Square, to: Square, piece: PieceSymbol = 'q') => {
    if (busy || reviewing || reviewIndex !== null || outcome || (mode === 'bot' && game.current.turn() !== side)) return;
    if (mode === 'online') {
      if (online.pending || online.connection !== 'connected' || online.room?.status !== 'active' || game.current.turn() !== side) return;
      const possible = game.current.moves({ square: from, verbose: true }).find(move => move.to === to && (!move.promotion || move.promotion === piece));
      if (!possible) { notify('That move isn’t legal. Try a highlighted square.'); return; }
      setPromotion(null); setSelected(null); await online.move(uci(possible)); return;
    }
    const before = game.current.fen();
    let move;
    try { move = game.current.move({ from, to, promotion: piece }); } catch { notify('That move isn’t legal. Try a highlighted square.'); return; }
    const record: MoveRecord = { san: move.san, uci: uci(move), before, after: game.current.fen(), color: move.color };
    setSelected(null); setHint(null); setPromotion(null); setRecords(prev => [...prev, record]); setFen(record.after); playSound(move.isCapture());
    const end = gameOutcome(game.current); if (end) setOutcome(end);
    if (engineStatus !== 'ready') return;
    const token = generation.current; setBusy(true);
    try {
      await analyzeRecord(record, token);
      if (token !== generation.current) return;
      if (mode === 'bot' && !end) await computerMove(token, bot);
    } catch (error) { if (token === generation.current) handleEngineError(error); }
    finally { if (token === generation.current) setBusy(false); }
  };

  const tryMove = (from: Square, to: Square) => {
    const possible = game.current.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!possible.length) { setSelected(null); return; }
    if (possible.some(m => m.promotion)) setPromotion({ from, to });
    else void commitMove(from, to);
  };

  const boardFen = reviewIndex === null ? fen : reviewIndex === 0 ? initialFen : records[reviewIndex - 1]?.after || fen;
  const position = new Chess(boardFen);
  const isPlayable = !busy && !reviewing && !outcome && reviewIndex === null && (mode !== 'bot' || (position.turn() === side && engineStatus === 'ready')) && (mode !== 'online' || (online.room?.status === 'active' && online.connection === 'connected' && !online.pending && position.turn() === side));
  const legalMoves = selected && isPlayable ? position.moves({ square: selected, verbose: true }) : [];
  const shownRecord = reviewIndex === null ? records.at(-1) : records[reviewIndex - 1];
  const coachRecord = reviewIndex === null && mode === 'bot' ? [...records].reverse().find(r => r.color === side) : shownRecord;
  const liveAnalysis = useLiveAnalysis(boardFen, engineRetry, !reviewing && engineStatus === 'ready' && (mode !== 'online' || online.room?.status === 'finished'));
  const shownEval = liveAnalysis.evaluation || evaluations.current.get(boardFen) || shownRecord?.evaluation;
  const shownLast = shownRecord?.uci;

  const onSquare = (square: Square) => {
    if (!isPlayable) return;
    if (selected && legalMoves.some(m => m.to === square)) { tryMove(selected, square); return; }
    const piece = position.get(square);
    if (piece && piece.color === position.turn()) setSelected(selected === square ? null : square);
    else setSelected(null);
  };

  const beginGame = async (newMode: Mode = mode, sameOpponent = false) => {
    if (online.room && ['active', 'waiting'].includes(online.room.status)) {
      if (online.room.status === 'active') { setDialog('resign'); return; }
      if (!await online.action('cancel')) return;
    }
    online.forget(); syncedOnline.current = { code: '', version: -1, round: 0 }; localGameId.current = crypto.randomUUID();
    const token = ++generation.current;
    const playerSide = sameOpponent ? side : chosenSide === 'random' ? Math.random() < 0.5 ? 'w' : 'b' : chosenSide;
    const nextBot = sameOpponent ? bot : selectedBot;
    const minutes = sameOpponent ? activeTimeControl : timeControl;
    game.current = new Chess(); setInitialFen(START_FEN); setFen(START_FEN); setRecords([]); setMode(newMode); setSide(playerSide); setFlipped(playerSide === 'b'); setBot(nextBot); setSelected(null); setReviewIndex(null); setOutcome(null); outcomeRef.current = null; setHint(null); setDialog(null); setPendingMode(null); setBusy(false); setReviewing(false); setTab(newMode === 'local' || newMode === 'online' ? 'game' : 'analysis'); setActiveTimeControl(newMode === 'analysis' ? 0 : minutes); setClocks({ w: minutes * 60000, b: minutes * 60000 }); savedId.current = null;
    if (sameOpponent) { setSelectedBot(nextBot); setTimeControl(minutes); }
    if (newMode === 'bot' && playerSide === 'b' && engineStatus === 'ready') {
      setBusy(true);
      try { await computerMove(token, nextBot); } catch (error) { if (token === generation.current) handleEngineError(error); }
      finally { if (token === generation.current) setBusy(false); }
    }
  };

  const takeback = () => {
    if (!records.length || reviewing || mode === 'online') return;
    generation.current++; setBusy(false); setOutcome(null); outcomeRef.current = null; setSelected(null); setHint(null); setReviewIndex(null); savedId.current = null;
    let count = 1;
    if (mode === 'bot' && records.length >= 2 && game.current.turn() === side) count = 2;
    for (let i = 0; i < count; i++) game.current.undo();
    const nextFen = game.current.fen(); setFen(nextFen); setRecords(prev => prev.slice(0, -count));
  };

  const requestHint = async () => {
    if (busy || reviewing || outcome || engineStatus !== 'ready' || mode === 'online') return;
    setBusy(true); const token = generation.current;
    try { const result = await evaluate(boardFen); if (token !== generation.current) return; setHint(result.bestMove); setSelected(result.bestMove.slice(0, 2) as Square); notify(`Try ${toSan(boardFen, result.bestMove)} — Stockfish’s top choice.`); }
    catch (error) { handleEngineError(error); }
    finally { if (token === generation.current) setBusy(false); }
  };

  const reviewGame = async () => {
    if (!records.length || busy || reviewing || engineStatus !== 'ready' || onlineInProgress) return;
    generation.current++; const token = generation.current;
    if (mode !== 'online') setMode('analysis');
    setTab('analysis'); setReviewing(true); setReviewProgress(0); setReviewIndex(null);
    try { for (let i = 0; i < records.length; i++) { await analyzeRecord(records[i], token); if (token !== generation.current) return; setReviewProgress(Math.round((i + 1) / records.length * 100)); } notify('Review complete. Select any move to explore it.'); }
    catch (error) { handleEngineError(error); }
    finally { if (token === generation.current) setReviewing(false); }
  };

  const enterAnalysis = () => { if (onlineInProgress) { notify('Analysis is available after your online game.'); return; } if (online.room?.status === 'waiting') { notify('Cancel your room before opening analysis.'); return; } online.forget(); generation.current++; setBusy(false); setReviewing(false); setMode('analysis'); setTab('analysis'); setMobileNav(false); setSelected(null); };
  const switchPlayMode = (nextMode: Mode) => { setMobileNav(false); if (mode === nextMode) return; if (onlineInProgress) { setDialog('resign'); return; } if (records.length) { setPendingMode(nextMode); setDialog('new'); } else void beginGame(nextMode); };

  const leaveOnline = async () => {
    if (online.room?.status === 'active') { setDialog('resign'); return; }
    if (online.room?.status === 'waiting' && !await online.action('cancel')) return;
    online.forget(); syncedOnline.current = { code: '', version: -1, round: 0 };
    generation.current++; game.current = new Chess(); setFen(START_FEN); setInitialFen(START_FEN); setRecords([]);
    setOutcome(null); outcomeRef.current = null; setSelected(null); setHint(null); setReviewIndex(null);
    setFlipped(false); setSide('w'); setTab('game'); setActiveTimeControl(0); setClocks({ w: 0, b: 0 }); savedId.current = null;
  };

  const resignGame = async () => {
    if (mode === 'online') { if (await online.action('resign')) setDialog(null); return; }
    generation.current++; setBusy(false); setOutcome(`${mode === 'bot' ? side === 'w' ? 'Black' : 'White' : game.current.turn() === 'w' ? 'Black' : 'White'} wins by resignation`); setDialog(null);
  };

  const playAgain = () => {
    if (mode === 'online') { void online.action(online.room?.rematchOffer && online.room.rematchOffer !== side ? 'accept-rematch' : 'request-rematch'); return; }
    void beginGame(mode, true);
  };

  function buildPgn() {
    const c = new Chess(initialFen);
    for (const record of recordsRef.current) makeUci(c, record.uci);
    c.setHeader('Event', 'Knight Club practice'); c.setHeader('Site', 'Knight Club'); c.setHeader('Date', new Date().toISOString().slice(0, 10).replaceAll('-', '.'));
    c.setHeader('White', mode === 'online' ? online.room?.players.w || 'White' : mode === 'bot' && side === 'b' ? bot.name : 'You'); c.setHeader('Black', mode === 'online' ? online.room?.players.b || 'Black' : mode === 'bot' && side === 'w' ? bot.name : 'Player 2');
    if (mode === 'online' && online.room) c.setHeader('Round', String(online.room.round));
    if (outcomeRef.current) c.setHeader('Result', outcomeRef.current.startsWith('White') ? '1-0' : outcomeRef.current.startsWith('Black') ? '0-1' : '1/2-1/2');
    return c.pgn();
  }
  const exportPgn = () => {
    if (!records.length) { notify('Make a move first, then export your game.'); return; }
    const url = URL.createObjectURL(new Blob([buildPgn()], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a'); a.href = url; a.download = `knight-club-${new Date().toISOString().slice(0, 10)}.pgn`; a.click(); URL.revokeObjectURL(url); notify('Your PGN is ready.');
  };

  const loadPosition = (text: string) => {
    if (onlineInProgress || online.room?.status === 'waiting') { notify('Finish or leave your online room before importing a game.'); return; }
    try {
      const c = new Chess(); let start = START_FEN;
      if (/^[rnbqkpRNBQKP1-8/]+\s[wb]\s/.test(text.trim())) { c.load(text.trim()); start = c.fen(); }
      else { c.loadPgn(text.trim()); start = c.history({ verbose: true })[0]?.before || c.fen(); }
      const history = c.history({ verbose: true }).map(m => ({ san: m.san, uci: uci(m), before: m.before, after: m.after, color: m.color }));
      if (!text.trim()) throw new Error('Enter a PGN game or a FEN position.');
      generation.current++; game.current = c; setInitialFen(start); setFen(c.fen()); setRecords(history); setMode('analysis'); setTab('analysis'); setBusy(false); setReviewing(false); setReviewIndex(null); setSelected(null); setHint(null); setOutcome(gameOutcome(c)); setDialog(null); setInput(''); setInputError(''); savedId.current = 'imported';
      notify('Game loaded. Run a review to analyze every move.');
    } catch (error) { setInputError(error instanceof Error ? error.message : 'That PGN or FEN could not be read.'); }
  };

  const navigateReview = useCallback((index: number | null) => { setReviewIndex(index); setSelected(null); setHint(null); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog || promotion || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); navigateReview(Math.max(0, (reviewIndex ?? records.length) - 1)); }
      if (event.key === 'ArrowRight') { event.preventDefault(); const next = (reviewIndex ?? records.length) + 1; navigateReview(next >= records.length ? null : next); }
      if (event.key === 'Escape') { setSelected(null); setHint(null); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [dialog, promotion, reviewIndex, records.length, navigateReview]);

  const analyzed = records.filter(r => r.quality);
  const accuracyFor = (color: Color) => {
    const moves = analyzed.filter(r => r.color === color);
    if (!moves.length) return '—';
    return `${Math.round(moves.reduce((sum, r) => sum + Math.max(0, 100 * Math.exp(-0.003 * (r.loss || 0))), 0) / moves.length)}%`;
  };
  const whitePercent = Math.min(96, Math.max(4, 50 + 46 * Math.tanh((shownEval?.cp || 0) / 400)));
  const botThinking = busy && mode === 'bot' && game.current.turn() !== side;
  const playerTurn = mode !== 'bot' && mode !== 'online' || game.current.turn() === side;
  const statusText = outcome || (mode === 'online' && online.connection !== 'connected' ? 'Reconnecting to your game…' : mode === 'online' && !online.room ? 'Create a room, find a player, or join an invite.' : mode === 'online' && online.room?.status === 'waiting' ? 'Waiting for an opponent. Share your invite to get started.' : online.pending ? 'Sending your move…' : reviewing ? `Reviewing your game · ${reviewProgress}%` : reviewIndex !== null ? 'Exploring the game' : botThinking ? `${bot.name} is thinking…` : busy ? 'Analyzing the move…' : position.isCheck() ? 'Check! Protect your king.' : mode === 'analysis' ? 'Analysis board · play either side' : !playerTurn ? mode === 'online' ? 'Your opponent’s turn.' : 'Retry the engine to continue' : 'Your move. Make it a good one.');
  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor: Color = flipped ? 'b' : 'w';
  const isBot = (color: Color) => mode === 'bot' && color !== side;
  const result = mode !== 'analysis' && (mode !== 'online' || online.room?.status === 'finished' && online.room.outcome === outcome && online.room.seat === side) ? presentResult(outcome, mode === 'local' ? null : side) : null;
  const resultGameId = mode === 'online' && online.room ? `${online.room.code}:${online.room.round}` : localGameId.current;
  const rematch = mode !== 'online' || !online.room?.rematchOffer ? 'none' : online.room.rematchOffer === side ? 'sent' : 'received';
  const capturePieces = (color: Color) => {
    return records.slice(0, reviewIndex ?? records.length).filter(record => record.color === color).flatMap(record => {
      const move = makeUci(new Chess(record.before), record.uci);
      return move?.captured ? [`${color === 'w' ? 'b' : 'w'}${move.captured.toUpperCase()}`] : [];
    });
  };

  const renderPlayer = (color: Color) => {
    const opponent = isBot(color);
    const captures = capturePieces(color), advantage = materialAdvantage(position, color);
    const onlineName = online.room?.players[color] || (color === side ? 'You' : 'Opponent');
    return <div className={`player-row ${game.current.turn() === color && !outcome && reviewIndex === null ? 'to-move' : ''}`}>
      {opponent ? <Avatar bot={bot} /> : <div className={`avatar player-avatar ${color === 'b' ? 'black-side' : ''}`}><KnightMark /></div>}
      <div className="player-info"><div className="player-name">{opponent ? bot.name : mode === 'online' ? color === side ? 'You' : onlineName : mode === 'bot' ? 'You' : color === 'w' ? 'White' : 'Black'} <span>{opponent ? bot.rating : mode === 'online' ? color === side ? onlineName : 'Online player' : mode === 'bot' ? 'Ready to play' : 'Local player'}</span>{opponent && <span className="bot-tag">BOT</span>}</div>
      <div className="player-detail">{captures.length || advantage > 0 ? <><div className="captured">{captures.map((p, i) => <img key={`${p}-${i}`} src={`/pieces/${p}.svg`} alt="" />)}</div>{advantage > 0 && <span className="material-advantage" aria-label={`${color === 'w' ? 'White' : 'Black'} is ahead by ${advantage} ${advantage === 1 ? 'point' : 'points'} of material`} title="Material: pawn 1, knight/bishop 3, rook 5, queen 9">+{advantage}</span>}</> : opponent ? bot.label : <><span className={`side-dot ${color}`} />Playing as {color === 'w' ? 'white' : 'black'}</>}</div></div>
      <div className={`clock ${game.current.turn() === color && records.length && !outcome ? 'active' : ''}`}><Clock3 size={16} /><span>{activeTimeControl && mode !== 'analysis' ? clockText(clocks[color]) : '∞'}</span></div>
    </div>;
  };

  return <div className={`app-shell theme-${boardTheme} ${mode === 'online' ? 'online-mode' : ''} ${mode === 'online' && (!online.room || online.room.status === 'waiting') ? 'online-lobby' : ''}`}>
    {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="/" aria-label="Knight Club home"><KnightMark /><span>knight<span className="brand-light">club</span><i /></span></a>
      <div className="nav-section-label">A little better, every game.</div>
      <nav aria-label="Main navigation">
        <button aria-label="Play chess" className={`nav-link ${mode === 'bot' || mode === 'local' ? 'active' : ''}`} onClick={() => switchPlayMode('bot')}><Swords size={21} /><span>Play chess</span><ChevronDown size={15} /></button>
        <div className="subnav"><button className={mode === 'bot' ? 'active' : ''} onClick={() => switchPlayMode('bot')}>Play computer <span className="tiny-dot" /></button><button className={mode === 'local' ? 'active' : ''} onClick={() => switchPlayMode('local')}>Same device <Users size={14} /></button></div>
        <button aria-label="Play online" title="Play online" className={`nav-link ${mode === 'online' ? 'active' : ''}`} onClick={() => switchPlayMode('online')}><Users size={21} /><span>Play online</span></button>
        <button aria-label="Analysis board" className={`nav-link ${mode === 'analysis' ? 'active' : ''}`} onClick={enterAnalysis}><BarChart3 size={21} /><span>Analysis</span><span className="free-label">FREE</span></button>
        <button aria-label="My games" className="nav-link" onClick={() => { setDialog('games'); setMobileNav(false); }}><History size={21} /><span>My games</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="club-note"><div className="club-note-icon"><Sparkles size={20} /></div><strong>Good moves.<br />Great possibilities.</strong><p>Play, learn, and find your<br />own kind of brilliant.</p><div className="note-check"><Check size={13} />Always free. Always yours.</div></div>
        <button aria-label="Settings" className="nav-link" onClick={() => setDialog('settings')}><Settings2 size={19} /><span>Settings</span></button>
        <button aria-label="How to play" className="nav-link" onClick={() => setDialog('help')}><CircleHelp size={19} /><span>How to play</span><ArrowUpRight size={15} /></button>
        <div className="guest-profile"><div className="guest-icon">Y</div><div><strong>Your space</strong><span>Make yourself at home</span></div><MoreHorizontal size={18} /></div>
      </div>
    </aside>

    <main>
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={22} /></button><span>Play</span><ChevronRight size={14} /><strong>{mode === 'bot' ? 'Computer' : mode === 'local' ? 'Local game' : mode === 'online' ? 'Online game' : 'Analysis board'}</strong></div><div className="topbar-right"><span className={`engine-status ${engineStatus}`}><span />{mode === 'online' && online.room?.status !== 'finished' ? 'Online chess' : engineStatus === 'loading' ? 'Loading Stockfish' : engineStatus === 'error' ? 'Engine needs attention' : 'Stockfish ready'}</span><button className="help-button icon-button" aria-label="Help" onClick={() => setDialog('help')}><CircleHelp size={19} /></button><div className="top-avatar">Y</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><h1>{mode === 'analysis' ? 'Find the idea behind the move.' : 'Your next great move starts here.'}</h1><p>{mode === 'analysis' ? 'Explore any position. Understand every possibility.' : 'A worthy opponent. A fresh board. A little better with every game.'}</p></div><div className="practice-badge"><span /><span>No pressure.<br /><strong>Just practice.</strong></span></div></div>
        {engineStatus === 'error' && <div className="engine-error" role="alert"><Cpu size={20} /><span>{engineMessage}</span><button onClick={() => { setEngineRetry(n => n + 1); setBusy(false); }}>Retry engine</button></div>}

        <div className="play-layout">
          <section className="board-column" aria-label="Chess game">
            {renderPlayer(topColor)}
            <div className="board-wrap">
              {(mode !== 'online' || online.room?.status === 'finished') && <div className="evaluation-bar" aria-label={`Evaluation ${evalText(shownEval)} from White’s perspective`}><div className="eval-black" /><div className="eval-white" style={{ height: `${whitePercent}%`, top: flipped ? 0 : 'auto', bottom: flipped ? 'auto' : 0 }} /><span className={`eval-number ${(shownEval?.cp || 0) > 0 ? 'positive' : ''}`} style={{ top: flipped ? 6 : 'auto', bottom: flipped ? 'auto' : 6 }}>{evalText(shownEval)}</span></div>}
              <div className="board" role="group" aria-label="Chessboard">
                {Array.from({ length: 64 }, (_, index) => {
                  const row = Math.floor(index / 8), col = index % 8;
                  const file = flipped ? 7 - col : col, rank = flipped ? row + 1 : 8 - row;
                  const square = `${'abcdefgh'[file]}${rank}` as Square;
                  const piece = position.get(square), light = (file + rank) % 2 !== 0;
                  const legal = legalMoves.some(m => m.to === square);
                  const lastMove = shownLast && [shownLast.slice(0, 2), shownLast.slice(2, 4)].includes(square);
                  const isHint = hint && [hint.slice(0, 2), hint.slice(2, 4)].includes(square);
                  const inCheck = piece?.type === 'k' && piece.color === position.turn() && position.isCheck();
                  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
                    if (!isPlayable || !piece || piece.color !== position.turn()) { event.preventDefault(); return; }
                    const image = event.currentTarget.querySelector<HTMLImageElement>('.piece');
                    if (!image) { event.preventDefault(); return; }
                    // Native dragging otherwise snapshots the entire square,
                    // including its background, coordinates, and highlights.
                    event.dataTransfer.setDragImage(image, image.width / 2, image.height / 2);
                    event.dataTransfer.setData('text/plain', square);
                    event.dataTransfer.effectAllowed = 'move';
                    setSelected(square);
                  };
                  return <button key={square} type="button" className={`square ${light ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${lastMove ? 'last-move' : ''} ${isHint ? 'hint-square' : ''} ${inCheck ? 'check-square' : ''}`} aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${pieceNames[piece.type]}` : ''}${legal ? ' legal destination' : ''}`} aria-pressed={selected === square} onClick={() => onSquare(square)} draggable={!!piece && isPlayable && piece.color === position.turn()} onDragStart={onDragStart} onDragOver={event => { if (isPlayable) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const source = event.dataTransfer.getData('text/plain'); if (/^[a-h][1-8]$/.test(source)) tryMove(source as Square, square); }}>
                    {col === 0 && <span className="coordinate rank">{rank}</span>}{row === 7 && <span className="coordinate file">{'abcdefgh'[file]}</span>}
                    {piece && <img className="piece" src={`/pieces/${piece.color}${piece.type.toUpperCase()}.svg`} alt="" draggable={false} />}
                    {showLegal && legal && <span className={piece ? 'legal-capture' : 'legal-dot'} />}
                    {shownRecord?.quality && square === shownLast?.slice(2, 4) && tab === 'analysis' && <span className={`board-quality quality-${shownRecord.quality.toLowerCase()}`}>{QUALITY_SYMBOL[shownRecord.quality]}</span>}
                  </button>;
                })}
                {result?.kind === 'win' && reviewIndex === null && <BoardConfetti key={resultGameId} gameId={resultGameId} />}
                {promotion && <div className="promotion-backdrop"><div className="promotion-picker" role="dialog" aria-label="Choose a promotion piece"><span>Promote your pawn</span><div>{(['q', 'r', 'b', 'n'] as PieceSymbol[]).map(p => <button key={p} aria-label={`Promote to ${pieceNames[p]}`} onClick={() => void commitMove(promotion.from, promotion.to, p)}><img src={`/pieces/${game.current.turn()}${p.toUpperCase()}.svg`} alt={pieceNames[p]} /></button>)}</div><button className="text-button" onClick={() => setPromotion(null)}>Cancel</button></div></div>}
              </div>
            </div>
            {renderPlayer(bottomColor)}
            <div className="board-toolbar"><div><button className="toolbar-button" disabled={!records.length || reviewing || mode === 'online'} onClick={takeback}><RotateCcw size={17} /><span>Take back</span></button><button className="toolbar-button" disabled={busy || reviewing || !!outcome || engineStatus !== 'ready' || mode === 'online'} onClick={() => void requestHint()}><Lightbulb size={17} /><span>Hint</span></button></div><div><button className="icon-button" title="Flip board" aria-label="Flip board" onClick={() => setFlipped(v => !v)}><ArrowDownUp size={17} /></button><button className="icon-button" title={sound ? 'Mute sound' : 'Enable sound'} aria-label={sound ? 'Mute sound' : 'Enable sound'} onClick={() => setSound(v => !v)}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button className="icon-button" title="Export PGN" aria-label="Export PGN" onClick={exportPgn}><Download size={18} /></button><span className="toolbar-divider" /><button className="icon-button" title="Resign game" aria-label="Resign game" disabled={!!outcome || mode === 'analysis' || (mode === 'online' ? online.room?.status !== 'active' : !records.length)} onClick={() => setDialog('resign')}><Flag size={17} /></button></div></div>
            {result && outcome ? <GameResult key={resultGameId} result={result} outcome={outcome} color={side} pending={online.pending || (mode === 'bot' && engineStatus !== 'ready')} reviewDisabled={!records.length || busy || reviewing || engineStatus !== 'ready'} rematch={rematch} opponent={online.room?.players[side === 'w' ? 'b' : 'w'] || 'your opponent'} onPlayAgain={playAgain} onReview={() => void reviewGame()} onDecline={() => void online.action('decline-rematch')} /> : mode === 'online' && online.room?.status !== 'finished' ? <div className="online-board-note"><ShieldCheck size={20} /><div><strong>{online.room?.status === 'active' ? 'A fair game. Just the two of you.' : 'Your next opponent is a link away.'}</strong><p>{online.room?.status === 'active' ? 'Engine hints and takebacks are off. Review the game together afterward.' : 'Open Play online to create a room or join a friend.'}</p></div></div> : <div className={`coach-message ${coachRecord?.quality ? `coach-${coachRecord.quality.toLowerCase()}` : ''}`} aria-live="polite"><div className="coach-icon">{coachRecord?.quality ? <span>{QUALITY_SYMBOL[coachRecord.quality]}</span> : <Lightbulb size={21} />}</div><div><strong>{outcome || (coach && coachRecord ? `${coachRecord.san} · ${coachRecord.quality || 'Taking a closer look'}` : 'Every move has a little lesson in it.')}</strong><p>{outcome ? 'Explore the analysis to see where the game turned.' : coach && coachRecord ? explainMove(coachRecord) : 'Play a move. Your free personal coach will take it from there.'}</p></div>{outcome && <button className="text-button" onClick={() => void reviewGame()}>Review <ArrowRight size={16} /></button>}</div>}
          </section>

          <aside className="companion-column" aria-label="Game controls and analysis">
            <section className="opponent-panel">
              <div className="panel-heading"><div className="panel-title"><span className="green-icon"><Gamepad2 size={18} /></span><h2>{mode === 'analysis' ? 'Your analysis studio' : mode === 'online' ? 'Play someone. Anywhere.' : mode === 'local' ? 'Better together.' : 'A rival for every level.'}</h2></div><button className="icon-button small" aria-label="Game settings" onClick={() => setDialog('settings')}><Settings2 size={16} /></button></div>
              {mode === 'bot' ? <><p className="panel-intro">Find your match. Then make your move.</p><div className="bot-grid">{BOTS.map(item => <button key={item.id} className={`bot-choice ${selectedBot.id === item.id ? 'chosen' : ''}`} onClick={() => setSelectedBot(item)} aria-label={`${item.name}, ${item.rating}, ${item.label}`} aria-pressed={selectedBot.id === item.id}><div className="bot-avatar-wrap"><Avatar bot={item} />{selectedBot.id === item.id && <span className="selected-check"><Check size={10} strokeWidth={3} /></span>}</div><strong>{item.name}</strong><span>{item.rating}</span></button>)}</div><div className="bot-description"><div><strong>{selectedBot.name}</strong><span>{selectedBot.label}</span><div className="difficulty-dots" aria-label={`Difficulty ${BOTS.indexOf(selectedBot) + 1} of 6`}>{BOTS.map((_, index) => <i key={index} className={index <= BOTS.indexOf(selectedBot) ? 'filled' : ''} />)}</div></div><p>“{selectedBot.quote}”</p></div></> : mode === 'online' ? <OnlinePanel online={online} notify={notify} onLeave={() => void leaveOnline()} /> : mode === 'local' ? <div className="local-intro"><Users size={40} /><h3>One board. Two minds.</h3><p>Share this screen with a friend. Play both sides, with optional coaching along the way.</p></div> : <div className="analysis-intro"><div className="engine-illustration"><Cpu size={31} /><span>∞</span></div><h3>Go deeper. For free.</h3><p>Import a game or play out an idea.<br />Stockfish is in your corner.</p><button className="secondary-button" onClick={() => { setInputError(''); setInput(''); setDialog('import'); }}><Upload size={16} />Import PGN or FEN</button></div>}
              {mode !== 'analysis' && mode !== 'online' && <div className="game-setup"><label className="color-label">You play as<div className="side-picker" role="group" aria-label="Choose your color"><button className={chosenSide === 'w' ? 'chosen' : ''} aria-label="Play as white" aria-pressed={chosenSide === 'w'} onClick={() => setChosenSide('w')}><span className="color-piece white">♚</span></button><button className={chosenSide === 'random' ? 'chosen' : ''} aria-label="Random color" aria-pressed={chosenSide === 'random'} onClick={() => setChosenSide('random')}><span className="random-piece">◐</span></button><button className={chosenSide === 'b' ? 'chosen' : ''} aria-label="Play as black" aria-pressed={chosenSide === 'b'} onClick={() => setChosenSide('b')}><span className="color-piece black">♚</span></button></div></label><label className="time-label">Time control<div className="select-wrap"><Clock3 size={15} /><select aria-label="Time control" value={timeControl} onChange={e => setTimeControl(Number(e.target.value))}>{timeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select><ChevronDown size={13} /></div></label></div>}
              {mode !== 'online' && <><button className="primary-button new-game-button" disabled={mode === 'bot' && engineStatus !== 'ready'} onClick={() => { if (records.length) setDialog('new'); else void beginGame(); }}>{engineStatus === 'loading' && mode === 'bot' ? <LoaderCircle size={19} className="spin" /> : mode === 'analysis' ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}<span>{engineStatus === 'loading' && mode === 'bot' ? 'Loading engine…' : mode === 'analysis' ? 'Fresh analysis board' : 'New game'}</span><span className="key-hint">↵</span></button>
              <div className="setup-note"><ShieldCheck size={13} />{mode === 'bot' ? 'Friendly games. No rating at stake.' : mode === 'local' ? 'Pass the board. Keep the good company.' : 'Unlimited analysis. No subscription.'}</div></>}
            </section>

            <section className="moves-panel">
              <div className="panel-tabs" role="tablist" aria-label="Game information"><button role="tab" aria-selected={tab === 'game'} className={tab === 'game' ? 'active' : ''} onClick={() => setTab('game')}><Swords size={16} />Game</button><button role="tab" disabled={mode === 'online' && online.room?.status !== 'finished'} title={mode === 'online' && online.room?.status !== 'finished' ? 'Analysis is available after the game' : undefined} aria-selected={tab === 'analysis'} className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}><BarChart3 size={16} />Analysis<span className="free-label">FREE</span></button></div>
              {tab === 'game' ? <><div className="opening-label"><BookOpen size={14} /><span>{openingName(records)}</span>{records.length > 0 && <span className="move-count">{Math.ceil(records.length / 2)} moves</span>}</div><div className="move-list" ref={moveListRef}>{!records.length ? <div className="moves-empty"><div><KnightMark /></div><strong>The best stories start with a move.</strong><p>Your game will unfold here.<br />Select a piece to get started.</p></div> : Array.from({ length: Math.ceil(records.length / 2) }, (_, i) => <div className="move-pair" key={i}><span className="move-number">{i + 1}.</span>{[i * 2, i * 2 + 1].map(index => { const record = records[index]; return record ? <button key={index} className={`move-cell ${(reviewIndex ?? records.length) === index + 1 ? 'current' : ''}`} onClick={() => navigateReview(index + 1 === records.length ? null : index + 1)}><span>{record.san}</span>{record.quality && <span title={record.quality} className={`move-quality quality-${record.quality.toLowerCase()}`}>{QUALITY_SYMBOL[record.quality]}</span>}</button> : <span key={index} />; })}</div>)}</div></> : <div className="analysis-content"><div className="analysis-engine">
                  <div><Cpu size={16} /><strong>Stockfish</strong><span className="engine-version">18</span></div>
                  <span><i className={liveAnalysis.analyzing ? 'pulse' : ''} />{liveAnalysis.error ? 'Unavailable' : liveAnalysis.loading || engineStatus === 'loading' ? 'Loading…' : reviewing ? 'Reviewing…' : liveAnalysis.analyzing ? `Live · Depth ${shownEval?.depth || 0}` : shownEval ? `Depth ${shownEval.depth}` : 'Ready'}</span>
                </div>
                {liveAnalysis.error && <div className="live-analysis-error" role="alert"><span>Live analysis is unavailable.</span><button onClick={() => setEngineRetry(n => n + 1)}>Retry</button></div>}
                <div className="position-evaluation"><strong>{evalText(shownEval)}</strong><div><span>{shownEval?.mate !== null && shownEval?.mate !== undefined ? 'Forced checkmate' : !shownEval || Math.abs(shownEval.cp) < 40 ? 'An even position' : shownEval.cp > 0 ? 'White has the advantage' : 'Black has the advantage'}</span><small>Evaluation from White’s perspective</small></div></div><div className="evaluation-track"><span style={{ width: `${whitePercent}%` }} /></div><div className="best-line"><span>BEST CONTINUATION</span><div>{shownEval?.pv.length ? pvToSan(boardFen, shownEval.pv).map((m, i) => <span key={i} className={i === 0 ? 'first' : ''}>{m}</span>) : <span className="muted">{liveAnalysis.analyzing || liveAnalysis.loading ? 'Finding the strongest line…' : position.isGameOver() ? 'Game over. Explore an earlier move.' : 'Play a move to explore the position.'}</span>}</div></div>{analyzed.length > 0 && <><div className="accuracy-row"><div><span>White accuracy</span><strong>{accuracyFor('w')}</strong></div><div><span>Black accuracy</span><strong>{accuracyFor('b')}</strong></div></div><p className="accuracy-note">Estimated from evaluation loss · {analyzed.length}/{records.length} moves analyzed</p><div className="eval-chart" aria-label="Evaluation throughout the game">{records.map((r, i) => <button key={i} title={`${i + 1}. ${r.san}: ${evalText(r.evaluation)}`} aria-label={`Review move ${i + 1}, ${r.san}`} onClick={() => navigateReview(i + 1 === records.length ? null : i + 1)} style={{ '--bar': `${Math.max(3, Math.min(48, Math.abs(r.evaluation?.cp || 0) / 8))}%` } as CSSProperties} className={(r.evaluation?.cp || 0) >= 0 ? 'up' : 'down'}><span /></button>)}</div></>}
                {coachRecord && <div className="analysis-judgment"><span className={`judgment-badge quality-${(coachRecord.quality || 'good').toLowerCase()}`}>{coachRecord.quality ? QUALITY_SYMBOL[coachRecord.quality] : '…'}</span><div><span className="analysis-move-label">{mode === 'bot' && reviewIndex === null ? 'Your last move' : 'Selected move'}</span><strong>{coachRecord.san} <span>{coachRecord.quality || 'Not analyzed yet'}</span></strong><p>{explainMove(coachRecord)}</p></div></div>}
                <button className="review-button secondary-button" disabled={!records.length || busy || reviewing || engineStatus !== 'ready' || onlineInProgress} onClick={() => void reviewGame()}>{reviewing ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{reviewing ? `Reviewing · ${reviewProgress}%` : 'Review full game'}<ArrowRight size={16} /></button>
              </div>}
              <div className="move-navigation"><button aria-label="First position" disabled={!records.length || reviewIndex === 0} onClick={() => navigateReview(0)}><ChevronFirst size={19} /></button><button aria-label="Previous move" disabled={!records.length || reviewIndex === 0} onClick={() => navigateReview(Math.max(0, (reviewIndex ?? records.length) - 1))}><ChevronLeft size={21} /></button><button aria-label="Next move" disabled={!records.length || reviewIndex === null} onClick={() => navigateReview((reviewIndex || 0) + 1 >= records.length ? null : (reviewIndex || 0) + 1)}><ChevronRight size={21} /></button><button aria-label="Latest position" disabled={!records.length || reviewIndex === null} onClick={() => navigateReview(null)}><ChevronLast size={19} /></button>{reviewIndex !== null && <button className="return-live" onClick={() => navigateReview(null)}>Live <span /></button>}</div>
              <div className="game-status" aria-live="polite">{busy || reviewing ? <LoaderCircle size={12} className="spin" /> : <span className={`status-dot ${outcome ? 'finished' : ''}`} />}<span>{statusText}</span></div>
            </section>
          </aside>
        </div>
        <footer className="page-footer"><div><Heart size={14} /><span>Made for the love of the game.</span></div><div><span><ShieldCheck size={13} />Free to play</span><i /><span><Cpu size={13} />Powered by Stockfish</span><button onClick={() => setDialog('help')}>About & credits <ArrowUpRight size={12} /></button></div></footer>
      </div>
    </main>

    <dialog ref={dialogRef} aria-label={dialog === 'import' ? 'Import a game' : dialog === 'settings' ? 'Board settings' : dialog === 'games' ? 'Saved games' : dialog === 'help' ? 'How to play' : dialog === 'resign' ? 'Resign game' : 'Start a new game'} className={`app-dialog ${dialog === 'games' ? 'wide-dialog' : ''}`} onCancel={() => { setDialog(null); setPendingMode(null); }} onClick={event => { if (event.target === event.currentTarget) { setDialog(null); setPendingMode(null); } }}>
      <button className="dialog-close icon-button" aria-label="Close dialog" onClick={() => { setDialog(null); setPendingMode(null); }}><X size={21} /></button>
      {dialog === 'new' && <><div className="dialog-symbol"><Swords size={28} /></div><h2>A fresh board, a fresh start.</h2><p>{(pendingMode || mode) === 'bot' ? `You’ll face ${selectedBot.name} (${selectedBot.rating}), playing ${chosenSide === 'random' ? 'a random color' : chosenSide === 'w' ? 'white' : 'black'}.` : (pendingMode || mode) === 'local' ? 'Start a new game with a friend on this device.' : 'Clear the board and explore a new line.'} The current position will be cleared. Export the PGN first if you’d like to keep it.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => { setDialog(null); setPendingMode(null); }}>Keep playing</button><button className="primary-button" onClick={() => void beginGame(pendingMode || mode)}><Play size={16} />Start new game</button></div></>}
      {dialog === 'resign' && <><div className="dialog-symbol"><Flag size={28} /></div><h2>Call it a game?</h2><p>{mode === 'online' ? 'Leaving ends this game and awards the win to your opponent. You can review the moves afterward.' : 'Every game teaches you something. You can review your moves afterward.'}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Keep playing</button><button className="primary-button" disabled={online.pending} onClick={() => void resignGame()}>Resign game</button></div></>}
      {dialog === 'import' && <><div className="dialog-symbol"><Upload size={28} /></div><h2>Bring a game to the club.</h2><p>Paste a PGN game or a FEN position. Then let Stockfish help you find the ideas you missed.</p><label className="import-label" htmlFor="game-import">PGN or FEN</label><textarea id="game-import" value={input} onChange={e => setInput(e.target.value)} placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'} rows={6} autoFocus />{inputError && <p className="input-error" role="alert">{inputError}</p>}<div className="dialog-actions"><label className="secondary-button file-label"><Upload size={16} />Open PGN file<input type="file" accept=".pgn,.txt" onChange={async e => { const file = e.target.files?.[0]; if (file) setInput(await file.text()); }} /></label><button className="primary-button" onClick={() => loadPosition(input)}>Analyze game <ArrowRight size={16} /></button></div></>}
      {dialog === 'settings' && <><div className="dialog-symbol"><Settings2 size={28} /></div><h2>Make it your board.</h2><p>A few small touches for the way you like to play.</p><div className="setting-row"><div><strong>Move sounds</strong><span>A little feedback with every move.</span></div><button role="switch" aria-checked={sound} aria-label="Move sounds" className={`toggle ${sound ? 'on' : ''}`} onClick={() => setSound(v => !v)}><span /></button></div><div className="setting-row"><div><strong>Legal move hints</strong><span>Show where a selected piece can go.</span></div><button role="switch" aria-checked={showLegal} aria-label="Legal move hints" className={`toggle ${showLegal ? 'on' : ''}`} onClick={() => setShowLegal(v => !v)}><span /></button></div><div className="setting-row"><div><strong>Personal coach</strong><span>Get feedback below the board.</span></div><button role="switch" aria-checked={coach} aria-label="Personal coach" className={`toggle ${coach ? 'on' : ''}`} onClick={() => setCoach(v => !v)}><span /></button></div><div className="setting-theme"><strong>Board palette</strong><div>{[{ id: 'club', name: 'Club green' }, { id: 'slate', name: 'Blue slate' }, { id: 'walnut', name: 'Walnut' }].map(t => <button key={t.id} className={`theme-swatch swatch-${t.id} ${boardTheme === t.id ? 'selected' : ''}`} aria-pressed={boardTheme === t.id} onClick={() => setBoardTheme(t.id)}><span><i /><i /><i /><i /></span>{t.name}</button>)}</div></div><button className="primary-button full-width" onClick={() => setDialog(null)}>Looks good <Check size={17} /></button></>}
      {dialog === 'games' && <><div className="dialog-symbol"><History size={28} /></div><h2>Your time at the board.</h2><p>Completed games are saved in this browser. Export a PGN to keep a copy anywhere.</p>{!savedGames.length ? <div className="saved-empty"><Trophy size={35} /><strong>Your first story is still being written.</strong><span>Finish a game to find it here.</span></div> : <div className="saved-games">{savedGames.map(saved => <button key={saved.id} onClick={() => loadPosition(saved.pgn)}><div><strong>You vs. {saved.bot}</strong><span>{saved.result} · {Math.ceil(saved.moves / 2)} moves</span></div><span>{new Date(saved.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}<ChevronRight size={17} /></span></button>)}</div>}<button className="primary-button full-width" onClick={() => setDialog(null)}><ArrowLeft size={16} />Back to the board</button></>}
      {dialog === 'help' && <><div className="dialog-symbol"><KnightMark /></div><h2>Welcome to Knight Club.</h2><p>Your place to play, explore, and get a little better. No account or subscription needed.</p><div className="help-items"><div><Target size={21} /><div><strong>Make your move</strong><p>Click a piece, then a highlighted square. You can also drag pieces. Castle by moving your king two squares; choose a piece when a pawn promotes.</p></div></div><div><Gamepad2 size={21} /><div><strong>Find your challenge</strong><p>Play online to create a private invite, join with a code, or find a random opponent. Choose a bot, your color, and a time control, then start a new game. Bot ratings indicate relative difficulty and are approximate.</p></div></div><div><BarChart3 size={21} /><div><strong>Understand the why</strong><p>Stockfish evaluates every move. Best, Excellent, Good, Inaccuracy, Mistake, and Blunder are based on evaluation loss. Accuracy and explanations are estimates, not Chess.com’s proprietary system.</p></div></div><div><BookOpen size={21} /><div><strong>Explore your game</strong><p>Select a move or use the arrow keys to go back. The analysis board accepts PGN and FEN. Review a whole game, or try a different continuation after taking moves back.</p></div></div></div><div className="credits">Engine: <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Stockfish.js 18 · GPL-3.0</a> · <a href="/engine/LICENSE.txt" target="_blank" rel="noreferrer">License</a><br />Pieces: <a href="https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces" target="_blank" rel="noreferrer">Colin M. L. Burnett · CC BY-SA 3.0</a><br />Rules: chess.js · Independent project, unaffiliated with Chess.com.</div><button className="primary-button full-width" onClick={() => setDialog(null)}>Let’s play <ArrowRight size={17} /></button></>}
    </dialog>
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
export default App;
