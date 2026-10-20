import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { StockfishEngine } from './engine';
import type { Evaluation } from './chess-utils';

// Live analysis has its own worker, so bot difficulty settings and move
// searches never interrupt or weaken the position's full-strength analysis.
export function useLiveAnalysis(fen: string, retry: number, enabled: boolean) {
  const [engine, setEngine] = useState<StockfishEngine | null>(null);
  const [snapshot, setSnapshot] = useState<{ fen: string; evaluation: Evaluation } | null>(null);
  const [status, setStatus] = useState<'loading' | 'analyzing' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const cache = useRef(new Map<string, Evaluation>());

  useEffect(() => {
    const current = new StockfishEngine();
    let active = true;
    setEngine(null); setStatus('loading'); setError('');
    current.loaded().then(() => { if (active) setEngine(current); }).catch(reason => {
      if (active) { setStatus('error'); setError(reason.message); }
    });
    return () => { active = false; current.terminate(); };
  }, [retry]);

  useEffect(() => {
    if (!engine || !enabled) return;
    const controller = new AbortController();
    const position = new Chess(fen);
    setError('');
    if (position.isGameOver()) {
      const evaluation: Evaluation = { cp: position.isCheckmate() ? position.turn() === 'w' ? -10000 : 10000 : 0, mate: position.isCheckmate() ? 0 : null, bestMove: '(none)', pv: [], depth: 0 };
      cache.current.set(fen, evaluation); setSnapshot({ fen, evaluation }); setStatus('ready');
      return;
    }
    setStatus('analyzing');
    void engine.search(fen, {
      depth: 30, time: 10000, skill: 20, signal: controller.signal,
      onUpdate: evaluation => {
        if (!controller.signal.aborted) setSnapshot({ fen, evaluation });
      },
    }).then(evaluation => {
      if (controller.signal.aborted) return;
      cache.current.set(fen, evaluation); setSnapshot({ fen, evaluation }); setStatus('ready');
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setStatus('error'); setError(reason.message);
    });
    return () => controller.abort();
  }, [engine, fen, enabled]);

  return {
    evaluation: snapshot?.fen === fen ? snapshot.evaluation : cache.current.get(fen),
    analyzing: enabled && status === 'analyzing',
    loading: !engine && status !== 'error',
    error,
  };
}
