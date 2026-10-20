import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { handleOnlineRequest } from '../server/multiplayer';
import type { RoomDatabase } from '../server/multiplayer';
import type { OnlineRoom } from '../src/online-types';
import { materialAdvantage } from '../src/chess-utils';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_glorious_edwin_jarvis.sql', import.meta.url), 'utf8'));
  const db: RoomDatabase = {
    prepare(query) {
      let values: (string | number | null)[] = [];
      const statement = {
        bind(...inputs: unknown[]) { values = inputs.map(value => { if (value === null || typeof value === 'string' || typeof value === 'number') return value; throw new Error('Invalid database value'); }); return statement; },
        async first<T>() { return (sql.prepare(query).get(...values) || null) as T | null; },
        async all<T>() { return { results: sql.prepare(query).all(...values) as T[] }; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; },
      };
      return statement;
    },
  };
  const player = (name: string) => {
    let cookie = '';
    return {
      async request(path: string, body?: Record<string, unknown>, expected = 200) {
        const response = await handleOnlineRequest(new Request(`https://chess.test/api/online/${path}`, {
          method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json', origin: 'https://chess.test' } : {}), cookie },
          body: body ? JSON.stringify(body) : undefined,
        }), db);
        const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
        const result = await response.json() as OnlineRoom & { error?: string };
        assert.equal(response.status, expected, `${path}: ${result.error || response.status}`);
        assert.equal(response.headers.get('cache-control'), 'no-store, private');
        assert.equal(JSON.stringify(result).includes('_key'), false, 'Seat credentials never leave the server');
        return result;
      },
      create: async function (kind = 'rooms', timeControl = 0, color = 'w') { return this.request(kind, { name, timeControl, color }, 201); },
    };
  };
  return { sql, db, player };
}

test('private room seats are authenticated, reconnectable, and limited to two players', async () => {
  const { player } = fixture(), host = player('Host'), guest = player('Guest'), stranger = player('Stranger');
  const room = await host.create();
  assert.match(room.code, /^[A-Z2-9]{8}$/); assert.equal(room.status, 'waiting'); assert.equal(room.visibility, 'private');
  await host.request(`rooms/${room.code}/move`, { move: 'e2e4', version: room.version }, 409);
  await stranger.request(`rooms/${room.code}`, undefined, 403);
  const joined = await guest.request(`rooms/${room.code}/join`, { name: 'Guest' });
  assert.equal(joined.status, 'active'); assert.equal(joined.seat, 'b');
  assert.deepEqual(joined.players, { w: 'Host', b: 'Guest' });
  await stranger.request(`rooms/${room.code}/join`, { name: 'Third player' }, 409);
  const resumed = await host.request(`rooms/${room.code}/join`, { name: 'Host' });
  assert.equal(resumed.seat, 'w'); assert.equal(resumed.code, room.code);
});

test('random matchmaking pairs waiting players, honors the clock, and never matches private rooms', async () => {
  const { player } = fixture();
  const privateGame = await player('Private').create();
  const first = player('One'), second = player('Two'), third = player('Three');
  const waiting = await first.create('match');
  assert.notEqual(waiting.code, privateGame.code); assert.equal(waiting.visibility, 'public');
  const differentClock = await third.create('match', 5); assert.notEqual(differentClock.code, waiting.code);
  const match = await second.request('match', { name: 'Two', timeControl: 0 });
  assert.equal(match.code, waiting.code); assert.equal(match.status, 'active');
  const inviteRoom = await player('Waiting').create('match', 10);
  const direct = await player('Friend').request(`rooms/${inviteRoom.code}/join`, { name: 'Friend' });
  assert.equal(direct.status, 'active');
});

test('simultaneous random searches pair without leaving two waiting rooms', async () => {
  const { player } = fixture();
  const a = player('A'), b = player('B');
  const [one, two] = await Promise.all([
    a.request('match', { name: 'A', timeControl: 0 }, 201),
    b.request('match', { name: 'B', timeControl: 0 }),
  ]);
  assert.equal(one.code, two.code); assert.equal(two.status, 'active');
});

test('the server rejects illegal, out-of-turn, unauthorized, and stale moves', async () => {
  const { player } = fixture(), white = player('White'), black = player('Black'), stranger = player('Visitor');
  const waiting = await white.create();
  let room = await black.request(`rooms/${waiting.code}/join`, {});
  await black.request(`rooms/${room.code}/move`, { move: 'e7e5', version: room.version }, 409);
  await white.request(`rooms/${room.code}/move`, { move: 'e2e5', version: room.version }, 400);
  await stranger.request(`rooms/${room.code}/move`, { move: 'e2e4', version: room.version }, 403);
  const oldVersion = room.version;
  room = await white.request(`rooms/${room.code}/move`, { move: 'e2e4', version: room.version });
  assert.deepEqual(room.moves, ['e2e4']);
  await black.request(`rooms/${room.code}/move`, { move: 'e7e5', version: oldVersion }, 409);
  room = await black.request(`rooms/${room.code}/move`, { move: 'e7e5', version: room.version });
  const expected = new Chess(); expected.move('e4'); expected.move('e5');
  assert.equal(room.fen, expected.fen());
  assert.equal((await white.request(`rooms/${room.code}`)).fen, room.fen);
});

test('checkmate, agreed draws, and resignations finish the same shared game', async () => {
  const { player } = fixture(), white = player('White'), black = player('Black');
  let room = await white.create(); room = await black.request(`rooms/${room.code}/join`, {});
  for (const [index, move] of ['f2f3', 'e7e5', 'g2g4', 'd8h4'].entries()) room = await (index % 2 ? black : white).request(`rooms/${room.code}/move`, { move, version: room.version });
  assert.equal(room.outcome, 'Black wins by checkmate'); assert.equal(room.status, 'finished');
  room = await white.create(); room = await black.request(`rooms/${room.code}/join`, {});
  room = await white.request(`rooms/${room.code}/action`, { action: 'offer-draw', version: room.version });
  await white.request(`rooms/${room.code}/action`, { action: 'accept-draw', version: room.version }, 409);
  room = await black.request(`rooms/${room.code}/action`, { action: 'accept-draw', version: room.version });
  assert.equal(room.outcome, 'Draw by agreement');
  room = await white.create(); room = await black.request(`rooms/${room.code}/join`, {});
  room = await black.request(`rooms/${room.code}/action`, { action: 'resign', version: room.version });
  assert.equal(room.outcome, 'White wins by resignation');
});

test('timed rooms use the server clock and cannot accept moves after flag fall', async () => {
  const { player, sql } = fixture(), white = player('White'), black = player('Black');
  let room = await white.create('rooms', 3); room = await black.request(`rooms/${room.code}/join`, {});
  assert.equal(room.clockRunning, false, 'The clock waits for the first move');
  room = await white.request(`rooms/${room.code}/move`, { move: 'e2e4', version: room.version });
  assert.equal(room.clockRunning, true);
  sql.prepare('UPDATE chess_rooms SET black_ms = 5, turn_started_at = ? WHERE code = ?').run(Date.now() - 1000, room.code);
  room = await white.request(`rooms/${room.code}`);
  assert.equal(room.outcome, 'White wins on time'); assert.equal(room.clocks.b, 0);
  await black.request(`rooms/${room.code}/move`, { move: 'e7e5', version: room.version }, 409);
});

test('cancelled rooms cannot be joined and new searches remove abandoned queues', async () => {
  const { player } = fixture(), host = player('Host'), guest = player('Guest');
  let room = await host.create();
  room = await host.request(`rooms/${room.code}/action`, { action: 'cancel', version: room.version });
  await guest.request(`rooms/${room.code}/join`, {}, 409);
  const first = await host.create('match');
  const second = await host.create('match', 5);
  assert.equal((await host.request(`rooms/${first.code}`)).status, 'cancelled');
  assert.equal(second.status, 'waiting');
});

test('cross-site writes are refused and seat cookies are private', async () => {
  const { db } = fixture();
  const blocked = await handleOnlineRequest(new Request('https://chess.test/api/online/rooms', { method: 'POST', headers: { origin: 'https://other.test', 'content-type': 'application/json' }, body: '{}' }), db);
  assert.equal(blocked.status, 403);
  const created = await handleOnlineRequest(new Request('https://chess.test/api/online/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), db);
  assert.match(created.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax;.*Secure/);
});

test('material counts captures, trades, promotions, and the displayed historical position', () => {
  const chess = new Chess(); assert.equal(materialAdvantage(chess, 'w'), 0);
  for (const move of ['e4', 'd5', 'exd5']) chess.move(move);
  assert.equal(materialAdvantage(chess, 'w'), 1); assert.equal(materialAdvantage(chess, 'b'), -1);
  chess.move('Qxd5'); assert.equal(materialAdvantage(chess, 'w'), 0);
  chess.undo(); assert.equal(materialAdvantage(chess, 'w'), 1);
  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  promotion.move('a8=Q+'); assert.equal(materialAdvantage(promotion, 'w'), 9);
});
