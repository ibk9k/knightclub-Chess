import { ENGINE_PATH } from './engine-path';
import type { Evaluation } from './chess-utils';

interface SearchOptions { depth?: number; time?: number; skill?: number }
export class StockfishEngine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private handler: ((line: string) => void) | null = null;
  private closed = false;
  private rejectActive: ((error: Error) => void) | null = null;

  constructor() {
    this.worker = new Worker(ENGINE_PATH);
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Stockfish took too long to load. Check your connection and retry.')), 25000);
      this.handler = line => {
        if (line === 'uciok') { this.worker.postMessage('setoption name Hash value 16'); this.worker.postMessage('isready'); }
        if (line === 'readyok') { clearTimeout(timer); this.handler = null; resolve(); }
      };
      this.worker.onerror = () => { clearTimeout(timer); const error = new Error('Stockfish could not load. Reload to try again.'); reject(error); this.rejectActive?.(error); };
      this.worker.onmessage = event => { for (const line of String(event.data).split('\n')) this.handler?.(line.trim()); };
      this.worker.postMessage('uci');
    });
    // Callers receive the original rejection via loaded() or search().
    void this.ready.catch(() => {});
  }
  loaded() { return this.ready; }
  search(fen: string, options: SearchOptions = {}): Promise<Evaluation> {
    const task = this.queue.catch(() => {}).then(async () => {
      await this.ready;
      if (this.closed) throw new Error('Engine closed');
      return new Promise<Evaluation>((resolve, reject) => {
        let result: Evaluation = { cp: 0, mate: null, bestMove: '', pv: [], depth: 0 };
        const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
        const timer = setTimeout(() => { this.worker.postMessage('stop'); this.handler = null; this.closed = true; this.worker.terminate(); reject(new Error('Engine search timed out. Please retry.')); }, 15000);
        this.rejectActive = reject;
        this.handler = line => {
          if (line.startsWith('info depth')) {
            const depth = /\bdepth (\d+)/.exec(line), score = /\bscore (cp|mate) (-?\d+)/.exec(line), pv = /\bpv (.+)/.exec(line);
            if (score && pv) {
              const raw = Number(score[2]), mate = score[1] === 'mate' ? raw * sign : null;
              result = { cp: mate === null ? raw * sign : (mate > 0 ? 10000 : -10000), mate, depth: Number(depth?.[1] || 0), pv: pv[1].split(' '), bestMove: pv[1].split(' ')[0] };
            }
          }
          if (line.startsWith('bestmove')) { clearTimeout(timer); this.handler = null; this.rejectActive = null; resolve({ ...result, bestMove: line.split(' ')[1] }); }
        };
        this.worker.postMessage(`setoption name Skill Level value ${options.skill ?? 20}`);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${options.depth ?? 14} movetime ${options.time ?? 550}`);
      });
    });
    this.queue = task;
    return task;
  }
  terminate() { this.closed = true; this.rejectActive?.(new Error('Engine closed')); this.worker.terminate(); }
}
