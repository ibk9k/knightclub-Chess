import { useState } from 'react';
import { Check, Copy, Link, LoaderCircle, LockKeyhole, Radio, Users, X } from 'lucide-react';
import type { OnlineGame } from './use-online-game';

export function OnlinePanel({ online, notify, onLeave }: { online: OnlineGame; notify: (message: string) => void; onLeave: () => void }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem('knight-club-name') || ''; } catch { return ''; } });
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get('join') || '');
  const [color, setColor] = useState('random');
  const [minutes, setMinutes] = useState(0);
  const [copied, setCopied] = useState('');
  const { room, pending, error, connection } = online;
  const rememberName = () => { try { localStorage.setItem('knight-club-name', name.trim()); } catch { /* optional */ } };
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); notify(`${label} copied.`); setTimeout(() => setCopied(''), 2500); }
    catch { notify('Copy the room code below to invite your friend.'); }
  };
  const copyIcon = (label: string) => copied === label ? <Check size={15} /> : <Copy size={15} />;
  const inviteUrl = room ? `${location.origin}/?join=${room.code}` : '';

  if (online.restoring) return <div className="online-panel"><div className="online-room-status"><LoaderCircle size={16} className="spin" /><strong>Returning to your game…</strong></div><p className="online-description">Restoring your seat and the latest position.</p><button className="text-button" onClick={online.forget}>Return to the lobby</button></div>;

  return <div className="online-panel">
    {!room ? <>
      <p className="panel-intro">Across the room or across the world.</p>
      <label className="online-field">Your name <span>Optional</span><input maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Player" autoComplete="nickname" /></label>
      <div className="online-options">
        <label>Play as<select aria-label="Online color" value={color} onChange={e => setColor(e.target.value)}><option value="random">Random color</option><option value="w">White</option><option value="b">Black</option></select></label>
        <label>Time control<select aria-label="Online time control" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[0, 3, 5, 10, 15, 30].map(value => <option key={value} value={value}>{value ? `${value} min` : 'No clock'}</option>)}</select></label>
      </div>
      <button className="primary-button full-width" disabled={pending} onClick={() => { rememberName(); void online.create('private', name, color, minutes); }}>{pending ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={17} />}Create private room</button>
      <p className="online-option-note">Only someone with your code or invite link can join.</p>
      <button className="secondary-button full-width" disabled={pending} onClick={() => { rememberName(); void online.create('public', name, 'random', minutes); }}><Radio size={17} />Find a random opponent</button>
      <p className="online-option-note">You can invite a friend while you wait, too.</p>
      <form className="join-room-form" onSubmit={event => { event.preventDefault(); rememberName(); void online.join(joinCode, name); }}>
        <label htmlFor="room-code">Have an invite?</label><div><input id="room-code" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Room code or invite link" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={250} /><button className="secondary-button" disabled={pending || !joinCode.trim()} type="submit">Join</button></div>
      </form>
    </> : <>
      <div className={`online-room-status ${room.status}`} aria-live="polite"><span className="status-dot" /><strong>{room.status === 'waiting' ? room.visibility === 'public' ? 'Looking for a player…' : 'Waiting for your friend' : room.status === 'active' ? 'Game in progress' : 'Game finished'}</strong></div>
      {room.status === 'waiting' && <p className="online-description">{room.visibility === 'public' ? 'We’ll pair you with the next player using this time control. Or send this invite to a friend.' : 'Send your invite link or room code. The game starts when a second player joins.'}</p>}
      {(room.status === 'waiting' || room.status === 'active') && <>
        <div className="room-code-box"><span>ROOM CODE</span><div><strong>{room.code}</strong><button className="icon-button" aria-label="Copy room code" title="Copy room code" onClick={() => void copy(room.code, 'Room code')}>{copyIcon('Room code')}</button></div></div>
        {room.status === 'waiting' && <><button className="secondary-button full-width" onClick={() => void copy(inviteUrl, 'Invite link')}><Link size={16} />{copied === 'Invite link' ? 'Invite link copied' : 'Copy invite link'}</button><input className="invite-link" aria-label="Invite link" value={inviteUrl} readOnly onFocus={e => e.target.select()} /></>}
      </>}
      <div className="online-seats"><Users size={17} /><div><strong>You play {room.seat === 'w' ? 'white' : 'black'}</strong><span>{room.timeControl ? `${room.timeControl} minutes per player` : 'No clock · take your time'}</span></div><LockKeyhole size={15} /></div>
      {room.status === 'active' && <>
        {connection === 'connected' && !room.connected[room.seat === 'w' ? 'b' : 'w'] && <p className="online-reconnect" role="status">Opponent disconnected. Their seat is saved while they reconnect.</p>}
        {room.drawOffer && (room.drawOffer === room.seat ? <p className="online-description">Draw offered. Waiting for your opponent.</p> : <div className="draw-offer"><strong>Your opponent offers a draw.</strong><div><button className="secondary-button" disabled={pending} onClick={() => void online.action('decline-draw')}>Decline</button><button className="primary-button" disabled={pending} onClick={() => void online.action('accept-draw')}>Accept draw</button></div></div>)}
        <button className="secondary-button full-width" disabled={pending || !!room.drawOffer} onClick={() => void online.action('offer-draw')}>Offer a draw</button>
      </>}
      {room.outcome && <p className="online-result" role="status">{room.outcome}</p>}
      {room.status === 'finished' && <p className="online-description">Use Play again below the board to rematch this opponent. You’ll keep this room and switch colors.</p>}
      <button className="text-button online-leave" disabled={pending} onClick={onLeave}>{room.status === 'waiting' ? <X size={15} /> : <Users size={15} />}{room.status === 'waiting' ? 'Cancel room' : room.status === 'active' ? 'Leave game' : 'Leave room'}</button>
    </>}
    {connection === 'reconnecting' && room && <p className="online-reconnect" role="status"><LoaderCircle size={14} className="spin" />Connection lost. Reconnecting…</p>}
    {error && connection !== 'reconnecting' && <p className="input-error online-error" role="alert">{error}</p>}
    <div className="online-fair-play">No account needed. Hints and live analysis pause during online games.</div>
  </div>;
}
