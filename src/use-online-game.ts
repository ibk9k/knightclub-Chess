import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnlineAction, OnlineRoom, RoomPreview } from './online-types';

const SAVED_ROOM = 'knight-club-online-room';
export function normalizeRoomCode(value: string) {
  let code = value.trim();
  try { code = new URL(code).searchParams.get('join') || code; } catch { /* A room code is also accepted. */ }
  return code.replace(/[\s-]/g, '').toUpperCase();
}
export async function previewRoom(value: string, signal: AbortSignal): Promise<RoomPreview> {
  const code = normalizeRoomCode(value);
  const response = await fetch(`/api/online/rooms/${code}/preview`, { credentials: 'same-origin', cache: 'no-store', signal });
  const result = await response.json() as RoomPreview & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Could not check this room. Please try again.');
  if (result.code !== code || typeof result.cheatMode !== 'boolean') throw new Error('Could not read the room settings.');
  return result;
}
class OnlineError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function api(path: string, body?: unknown): Promise<OnlineRoom> {
  const response = await fetch(`/api/online/${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => ({})) as Partial<OnlineRoom> & { error?: string };
  if (!response.ok) throw new OnlineError(result.error || 'The game server is unavailable. Please try again.', response.status);
  if (!result.code || !result.fen || !Array.isArray(result.moves) || !result.seat) throw new Error('The server returned an incomplete game. Please try again.');
  return result as OnlineRoom;
}
function saveRoom(code: string | null) {
  try { if (code) localStorage.setItem(SAVED_ROOM, code); else localStorage.removeItem(SAVED_ROOM); } catch { /* Private browsing may restrict storage. */ }
}

export function useOnlineGame() {
  const [room, setRoom] = useState<OnlineRoom | null>(null);
  const [pending, setPending] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [connection, setConnection] = useState<'connected' | 'reconnecting'>('connected');
  const [error, setError] = useState('');
  const roomRef = useRef(room); roomRef.current = room;
  const epoch = useRef(0), locked = useRef(false);
  const receivedAt = useRef(Date.now());

  const accept = useCallback((next: OnlineRoom) => {
    if (roomRef.current?.code === next.code && roomRef.current.version > next.version) return;
    receivedAt.current = Date.now(); roomRef.current = next; setRoom(next);
    saveRoom(next.code); setConnection('connected'); setError('');
  }, []);

  useEffect(() => {
    let mounted = true;
    let retry: ReturnType<typeof setTimeout>;
    let code: string | null = null;
    try { code = localStorage.getItem(SAVED_ROOM); } catch { /* optional */ }
    const invite = new URLSearchParams(location.search).get('join');
    if (!code || (invite && normalizeRoomCode(invite) !== code)) return;
    const token = epoch.current;
    setRestoring(true);
    const restore = async () => {
      if (!mounted || token !== epoch.current) return;
      try {
        const next = await api(`rooms/${code}`);
        if (mounted && token === epoch.current) { accept(next); setRestoring(false); }
      } catch (err) {
        if (!mounted || token !== epoch.current) return;
        if (err instanceof OnlineError && [403, 404].includes(err.status)) { saveRoom(null); setRestoring(false); return; }
        setConnection('reconnecting'); retry = setTimeout(restore, 2000);
      }
    };
    void restore();
    return () => { mounted = false; clearTimeout(retry); };
  }, [accept]);

  useEffect(() => {
    if (!room || !['waiting', 'active', 'finished'].includes(room.status)) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    const code = room.code, token = epoch.current;
    const poll = async () => {
      try {
        const next = await api(`rooms/${code}`);
        if (!cancelled && token === epoch.current && roomRef.current?.code === code) accept(next);
      } catch (err) {
        if (!cancelled && token === epoch.current) {
          setConnection('reconnecting');
          setError(err instanceof Error ? err.message : 'Connection lost. Reconnecting…');
        }
      } finally { if (!cancelled) timer = setTimeout(poll, document.hidden ? 5000 : room.status === 'finished' ? 1800 : 1100); }
    };
    timer = setTimeout(poll, 1000);
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); timer = setTimeout(poll, 0); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [room?.code, room?.status, accept]);

  const request = useCallback(async (path: string, body: unknown, replace = false) => {
    if (locked.current) return null;
    locked.current = true; setPending(true); setError('');
    const token = replace ? ++epoch.current : epoch.current;
    try {
      const next = await api(path, body);
      if (token === epoch.current) accept(next);
      return next;
    } catch (err) {
      if (token === epoch.current) {
        setError(err instanceof Error ? err.message : 'Could not connect. Please try again.');
        if (err instanceof OnlineError && err.status === 409 && roomRef.current) {
          try { const fresh = await api(`rooms/${roomRef.current.code}`); if (token === epoch.current) accept(fresh); } catch { /* Polling will reconnect. */ }
        }
      }
      return null;
    } finally { locked.current = false; setPending(false); }
  }, [accept]);

  const create = (kind: 'private' | 'public', name: string, color: string, timeControl: number, cheatMode = false) => request(kind === 'public' ? 'match' : 'rooms', { name, color, timeControl, cheatMode }, true);
  const join = (code: string, name: string, acceptCheatMode = false) => {
    const normalized = normalizeRoomCode(code);
    if (!/^[A-Z2-9]{8}$/.test(normalized)) { setError('Enter an 8-character room code or paste an invite link.'); return Promise.resolve(null); }
    return request(`rooms/${normalized}/join`, { name, acceptCheatMode }, true);
  };
  const move = (uci: string) => roomRef.current ? request(`rooms/${roomRef.current.code}/move`, { move: uci, version: roomRef.current.version }) : Promise.resolve(null);
  const action = (action: OnlineAction) => roomRef.current ? request(`rooms/${roomRef.current.code}/action`, { action, version: roomRef.current.version }) : Promise.resolve(null);
  const forget = () => {
    epoch.current++; roomRef.current = null; setRoom(null); saveRoom(null); setError(''); setConnection('connected'); setRestoring(false);
    const url = new URL(location.href); url.searchParams.delete('join'); history.replaceState(null, '', url);
  };
  return { room, pending, restoring, connection, error, receivedAt, create, join, move, action, forget, clearError: () => setError('') };
}
export type OnlineGame = ReturnType<typeof useOnlineGame>;
