import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StockfishEngine } from '../src/engine';
import type { Evaluation } from '../src/chess-utils';

class TestWorker {
  static latest: TestWorker;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  commands: string[] = [];
  constructor() { TestWorker.latest = this; }
  emit(data: string) { this.onmessage?.({ data }); }
  postMessage(command: string) {
    this.commands.push(command);
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
  }
  terminate() {}
}

test('analysis streams signed evaluations before the search finishes', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { value: TestWorker, configurable: true, writable: true });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else Reflect.deleteProperty(globalThis, 'Worker'); });
  const engine = new StockfishEngine();
  t.after(() => engine.terminate());
  await engine.loaded();
  const updates: Evaluation[] = [];
  const options = { depth: 20, time: 1000, onUpdate: (update: Evaluation) => updates.push(update) };
  let finished = false;
  const search = engine.search('8/8/8/8/8/8/5k2/7K b - - 0 1', options).then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  TestWorker.latest.emit('info depth 4 score cp 38 pv f2e3');
  const earlyFinished = finished;
  const earlyUpdates = updates.length;
  TestWorker.latest.emit('info depth 8 score mate 3 pv f2e3');
  TestWorker.latest.emit('bestmove f2e3');
  const result = await search;
  assert.equal(earlyFinished, false, 'a live update must arrive before bestmove');
  assert.equal(earlyUpdates, 1, 'forward the in-progress UCI evaluation');
  assert.equal(updates[0].cp, -38, 'normalize Black-to-move scores to White’s perspective');
  assert.equal(updates[1].mate, -3);
  assert.equal(result.depth, 8);
});

test('switching positions stops the old stream and drains it before the next search', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { value: TestWorker, configurable: true, writable: true });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else Reflect.deleteProperty(globalThis, 'Worker'); });
  const engine = new StockfishEngine();
  t.after(() => engine.terminate());
  await engine.loaded();
  const controller = new AbortController();
  const previousUpdates: Evaluation[] = [], currentUpdates: Evaluation[] = [];
  const previous = engine.search('8/8/8/8/8/8/5k2/7K w - - 0 1', { signal: controller.signal, onUpdate: e => previousUpdates.push(e) }).catch(error => error);
  await new Promise(resolve => setImmediate(resolve));
  const worker = TestWorker.latest;
  worker.emit('info depth 4 score cp 20 pv h1g1');
  controller.abort();
  const current = engine.search('8/8/8/8/8/8/5k2/7K b - - 0 1', { onUpdate: e => currentUpdates.push(e) });
  await new Promise(resolve => setImmediate(resolve));
  const searchesBeforeDrain = worker.commands.filter(c => c.startsWith('go ')).length;
  worker.emit('info depth 10 score cp 300 pv h1g1');
  worker.emit('bestmove h1g1');
  await new Promise(resolve => setImmediate(resolve));
  worker.emit('info depth 6 score cp 70 pv f2e3');
  worker.emit('bestmove f2e3');
  const previousResult = await previous;
  const currentResult = await current;
  assert.ok(worker.commands.includes('stop'));
  assert.equal(searchesBeforeDrain, 1, 'do not overlap the old and new UCI response streams');
  assert.equal(previousResult.name, 'AbortError');
  assert.equal(previousUpdates.length, 1, 'ignore late evaluations from the old position');
  assert.equal(currentUpdates.length, 1);
  assert.equal(currentUpdates[0].cp, -70);
  assert.equal(currentResult.bestMove, 'f2e3');
});
