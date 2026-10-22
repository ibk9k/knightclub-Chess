import { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import type { OnlineGame } from './use-online-game';

export function TakebackRequest({ online }: { online: OnlineGame }) {
  const notice = useRef<HTMLDivElement>(null);
  const room = online.room, own = room?.takebackOffer === room?.seat;
  useEffect(() => { if (!own) notice.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [own]);
  if (!room?.takebackOffer || room.status !== 'active') return null;
  return <div ref={notice} className="takeback-request" role="status" aria-live="polite">
    <div><RotateCcw size={19} /><strong>{own ? 'Takeback requested' : `${room.players[room.takebackOffer]} asks for a takeback`}</strong></div>
    <p>{own ? 'Waiting for your opponent’s approval.' : 'Undo their last move and any reply?'} Another move cancels this request. Clocks keep running.</p>
    <div className="takeback-request-actions">{own ? <button className="text-button" disabled={online.pending} onClick={() => void online.action('cancel-takeback')}>Cancel takeback request</button> : <><button className="secondary-button" disabled={online.pending} onClick={() => void online.action('decline-takeback')}>Decline takeback</button><button className="primary-button" disabled={online.pending} onClick={() => void online.action('accept-takeback')}>Accept takeback</button></>}</div>
  </div>;
}
