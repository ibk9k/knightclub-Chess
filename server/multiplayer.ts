import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { gameOutcome, makeUci } from '../src/chess-utils';
import type { OnlineRoom } from '../src/online-types';

// All changes to a room use its version as a compare-and-swap. A stale move,
// simultaneous join, or retried request can never overwrite a newer position.
export interface RoomDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): ReturnType<RoomDatabase['prepare']>;
    first<T>(): Promise<T | null>;
    all<T>(): Promise<{ results: T[] }>;
    run(): Promise<{ meta: { changes: number } }>;
  };
}
interface RoomRow {
  code: string; visibility: 'private' | 'public'; status: OnlineRoom['status'];
  white_key: string | null; black_key: string | null; white_name: string; black_name: string;
  moves: string; fen: string; version: number; time_control: number;
  white_ms: number; black_ms: number; turn_started_at: number | null;
  white_seen: number; black_seen: number; draw_offer: Color | null;
  outcome: string | null; created_at: number; updated_at: number;
}
const COOKIE = 'kc_player';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY = 86_400_000;
class RoomError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const opposite = (color: Color): Color => color === 'w' ? 'b' : 'w';
const colorName = (color: Color) => color === 'w' ? 'White' : 'Black';
const seatFor = (room: RoomRow, key: string): Color | null => room.white_key === key ? 'w' : room.black_key === key ? 'b' : null;
const cleanName = (name: unknown) => typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Player' : 'Player';
const roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), n => ALPHABET[n % ALPHABET.length]).join('');

async function identity(request: Request) {
  const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const isNew = !cookie || !/^[a-f0-9]{64}$/.test(cookie);
  const token = isNew ? Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('') : cookie;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const key = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  return { key, cookie: isNew ? `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}` : null };
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RoomError('Send a JSON request.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError('The request is empty.');
  let size = 0, text = ''; const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new RoomError('The request is too large.', 413); }
    text += decoder.decode(value, { stream: true });
  }
  try { const body = JSON.parse(text + decoder.decode()); if (body && typeof body === 'object' && !Array.isArray(body)) return body; } catch { /* handled below */ }
  throw new RoomError('The request could not be read.');
}
function clocksAt(room: RoomRow, now: number) {
  const clocks = { w: room.white_ms, b: room.black_ms };
  if (room.status === 'active' && room.time_control && room.turn_started_at !== null) {
    const turn = room.fen.split(' ')[1] as Color;
    clocks[turn] = Math.max(0, clocks[turn] - Math.max(0, now - room.turn_started_at));
  }
  return clocks;
}
async function readRoom(db: RoomDatabase, code: string) {
  const room = await db.prepare('SELECT * FROM chess_rooms WHERE code = ?').bind(code).first<RoomRow>();
  if (!room) throw new RoomError('Room not found. Check the code and try again.', 404);
  return room;
}
async function settleRoom(db: RoomDatabase, room: RoomRow, now: number): Promise<RoomRow> {
  const clocks = clocksAt(room, now);
  const expired = room.status === 'waiting' && now - room.created_at > DAY;
  const flag = room.status === 'active' && room.time_control > 0 && (clocks.w <= 0 || clocks.b <= 0);
  if (!expired && !flag) return room;
  const result = flag ? `${clocks.w <= 0 ? 'Black' : 'White'} wins on time` : 'Room expired';
  await db.prepare('UPDATE chess_rooms SET status = ?, outcome = ?, white_ms = ?, black_ms = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?')
    .bind(expired ? 'cancelled' : 'finished', result, clocks.w, clocks.b, now, room.code, room.version).run();
  return readRoom(db, room.code);
}
function snapshot(room: RoomRow, seat: Color, now: number): OnlineRoom {
  return { code: room.code, visibility: room.visibility, status: room.status, seat,
    players: { w: room.white_name, b: room.black_name },
    connected: { w: !!room.white_key && now - room.white_seen < 20_000, b: !!room.black_key && now - room.black_seen < 20_000 },
    moves: JSON.parse(room.moves), fen: room.fen, version: room.version, timeControl: room.time_control,
    clocks: clocksAt(room, now), clockRunning: room.status === 'active' && room.turn_started_at !== null && room.time_control > 0,
    serverNow: now, drawOffer: room.draw_offer, outcome: room.outcome };
}
async function claimRoom(db: RoomDatabase, room: RoomRow, key: string, name: string, now: number) {
  const existing = seatFor(room, key);
  if (existing) return room;
  room = await settleRoom(db, room, now);
  if (room.status !== 'waiting') throw new RoomError(room.status === 'active' ? 'This room already has two players.' : 'This room has ended. Ask for a new invite.', 409);
  const seat = room.white_key ? 'b' : 'w';
  const prefix = seat === 'w' ? 'white' : 'black';
  const result = await db.prepare(`UPDATE chess_rooms SET ${prefix}_key = ?, ${prefix}_name = ?, ${prefix}_seen = ?, status = 'active', version = version + 1, updated_at = ? WHERE code = ? AND version = ? AND status = 'waiting' AND ${prefix}_key IS NULL`)
    .bind(key, name, now, now, room.code, room.version).run();
  if (!result.meta.changes) throw new RoomError('Someone just joined this room. Try another room.', 409);
  return readRoom(db, room.code);
}

export async function handleOnlineRequest(request: Request, db?: RoomDatabase): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private', 'vary': 'Cookie', 'x-content-type-options': 'nosniff' });
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  try {
    if (!db) throw new RoomError('Online play is temporarily unavailable. Please try again shortly.', 503);
    const url = new URL(request.url), path = url.pathname.replace(/^\/api\/online\/?/, '').split('/').filter(Boolean);
    if (request.method !== 'GET' && request.method !== 'POST') throw new RoomError('Method not allowed.', 405);
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new RoomError('Open the game directly to continue.', 403);
    }
    const { key, cookie } = await identity(request); if (cookie) headers.set('set-cookie', cookie);
    const now = Date.now();
    const body = request.method === 'POST' ? await readBody(request) : {};
    if (request.method === 'POST' && path.length === 1 && ['rooms', 'match'].includes(path[0])) {
      const minutes = Number(body.timeControl ?? 0);
      if (![0, 3, 5, 10, 15, 30].includes(minutes)) throw new RoomError('Choose a valid time control.');
      const name = cleanName(body.name);
      // One waiting lobby per browser keeps closed or repeatedly clicked queues
      // from collecting opponents. Private rooms never enter this queue.
      await db.prepare("UPDATE chess_rooms SET status = 'cancelled', outcome = 'Room closed', version = version + 1 WHERE status = 'waiting' AND (white_key = ? OR black_key = ?)").bind(key, key).run();
      await db.prepare("DELETE FROM chess_rooms WHERE code IN (SELECT code FROM chess_rooms WHERE updated_at < ? AND status IN ('finished', 'cancelled', 'waiting') LIMIT 20)").bind(now - 7 * DAY).run();
      await db.prepare("UPDATE chess_rooms SET status = 'cancelled', outcome = 'Queue expired', version = version + 1 WHERE status = 'waiting' AND visibility = 'public' AND white_seen < ? AND black_seen < ?").bind(now - 15_000, now - 15_000).run();
      if (path[0] === 'match') {
        const candidates = await db.prepare("SELECT * FROM chess_rooms WHERE visibility = 'public' AND status = 'waiting' AND time_control = ? AND created_at > ? AND (white_seen > ? OR black_seen > ?) ORDER BY created_at LIMIT 6")
          .bind(minutes, now - DAY, now - 15_000, now - 15_000).all<RoomRow>();
        for (const candidate of candidates.results) {
          if (seatFor(candidate, key)) continue;
          try { const claimed = await claimRoom(db, candidate, key, name, now); return reply(snapshot(claimed, seatFor(claimed, key)!, now)); }
          catch (error) { if (!(error instanceof RoomError) || error.status !== 409) throw error; }
        }
      }
      const seat: Color = body.color === 'w' || body.color === 'b' ? body.color : crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? 'w' : 'b';
      for (let attempt = 0; attempt < 4; attempt++) {
        // The partial unique index allows only one waiting public room per
        // clock. If two people search simultaneously, the second joins it.
        if (path[0] === 'match') {
          const waiting = await db.prepare("SELECT * FROM chess_rooms WHERE visibility = 'public' AND status = 'waiting' AND time_control = ? LIMIT 1").bind(minutes).first<RoomRow>();
          if (waiting && !seatFor(waiting, key)) {
            try { const joined = await claimRoom(db, waiting, key, name, now); return reply(snapshot(joined, seatFor(joined, key)!, now)); }
            catch (error) { if (!(error instanceof RoomError) || error.status !== 409) throw error; continue; }
          }
        }
        const code = roomCode();
        const result = await db.prepare("INSERT OR IGNORE INTO chess_rooms (code, visibility, status, white_key, black_key, white_name, black_name, moves, fen, version, time_control, white_ms, black_ms, turn_started_at, white_seen, black_seen, draw_offer, outcome, created_at, updated_at) VALUES (?, ?, 'waiting', ?, ?, ?, ?, '[]', ?, 0, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)")
          .bind(code, path[0] === 'match' ? 'public' : 'private', seat === 'w' ? key : null, seat === 'b' ? key : null,
            seat === 'w' ? name : 'Opponent', seat === 'b' ? name : 'Opponent', new Chess().fen(), minutes, minutes * 60_000, minutes * 60_000, seat === 'w' ? now : 0, seat === 'b' ? now : 0, now, now).run();
        if (result.meta.changes) return reply(snapshot(await readRoom(db, code), seat, now), 201);
      }
      throw new RoomError('Could not create a room. Please try again.', 503);
    }
    if (path[0] !== 'rooms' || !/^[A-Z2-9]{8}$/.test(path[1] || '') || path.length > 3) throw new RoomError('Room not found. Check the code and try again.', 404);
    let room = await readRoom(db, path[1]);
    if (request.method === 'POST' && path[2] === 'join') room = await claimRoom(db, room, key, cleanName(body.name), now);
    const seat = seatFor(room, key);
    if (!seat) throw new RoomError('Join this room with its invite link or code first.', 403);
    room = await settleRoom(db, room, now);
    const prefix = seat === 'w' ? 'white' : 'black';
    if (now - (seat === 'w' ? room.white_seen : room.black_seen) >= 4000) {
      await db.prepare(`UPDATE chess_rooms SET ${prefix}_seen = ? WHERE code = ? AND ${prefix}_key = ?`).bind(now, room.code, key).run();
    }
    if (seat === 'w') room.white_seen = now; else room.black_seen = now;
    if (request.method === 'GET' && path.length === 2 || request.method === 'POST' && path[2] === 'join') return reply(snapshot(room, seat, now));
    if (request.method !== 'POST') throw new RoomError('Not found.', 404);
    if (body.version !== room.version) throw new RoomError('The game has changed. Refreshing the board; please try again.', 409);
    if (path[2] === 'move') {
      if (room.status !== 'active') throw new RoomError('Wait for your opponent to join before moving.', 409);
      const chess = new Chess(), moves: string[] = JSON.parse(room.moves);
      for (const move of moves) if (!makeUci(chess, move)) throw new Error('Invalid saved game');
      if (chess.turn() !== seat) throw new RoomError('It is your opponent’s turn.', 409);
      const move = typeof body.move === 'string' ? makeUci(chess, body.move) : null;
      if (!move) throw new RoomError('That move is not legal. Choose another square.');
      if (moves.length >= 1200) throw new RoomError('This game has reached its move limit.');
      moves.push(move.from + move.to + (move.promotion || ''));
      const result = gameOutcome(chess), clocks = clocksAt(room, now);
      const changed = await db.prepare('UPDATE chess_rooms SET moves = ?, fen = ?, status = ?, outcome = ?, white_ms = ?, black_ms = ?, turn_started_at = ?, draw_offer = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ? AND status = \'active\'')
        .bind(JSON.stringify(moves), chess.fen(), result ? 'finished' : 'active', result, clocks.w, clocks.b, now, room.draw_offer === opposite(seat) ? null : room.draw_offer, now, room.code, room.version).run();
      if (!changed.meta.changes) throw new RoomError('The game has changed. Please try again.', 409);
    } else if (path[2] === 'action') {
      let status = room.status, outcome = room.outcome, offer = room.draw_offer;
      switch (body.action) {
        case 'cancel': if (status !== 'waiting') throw new RoomError('The game has already started.', 409); status = 'cancelled'; outcome = 'Room closed'; break;
        case 'resign': if (status !== 'active') throw new RoomError('This game is not in progress.', 409); status = 'finished'; outcome = `${colorName(opposite(seat))} wins by resignation`; break;
        case 'offer-draw': if (status !== 'active') throw new RoomError('This game is not in progress.', 409); if (offer) throw new RoomError('There is already a draw offer.', 409); offer = seat; break;
        case 'accept-draw': if (status !== 'active' || offer !== opposite(seat)) throw new RoomError('There is no draw offer to accept.', 409); status = 'finished'; outcome = 'Draw by agreement'; offer = null; break;
        case 'decline-draw': if (status !== 'active' || offer !== opposite(seat)) throw new RoomError('There is no draw offer to decline.', 409); offer = null; break;
        default: throw new RoomError('Unknown game action.');
      }
      const clocks = clocksAt(room, now);
      const changed = await db.prepare('UPDATE chess_rooms SET status = ?, outcome = ?, draw_offer = ?, white_ms = ?, black_ms = ?, turn_started_at = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?')
        .bind(status, outcome, offer, clocks.w, clocks.b, room.turn_started_at === null ? null : now, now, room.code, room.version).run();
      if (!changed.meta.changes) throw new RoomError('The game has changed. Please try again.', 409);
    } else throw new RoomError('Not found.', 404);
    room = await readRoom(db, room.code);
    return reply(snapshot(room, seat, now));
  } catch (error) {
    if (error instanceof RoomError) return reply({ error: error.message }, error.status);
    console.error('Online chess request failed:', error instanceof Error ? error.message : 'Unknown error');
    return reply({ error: 'Could not reach the game server. Please try again.' }, 503);
  }
}
