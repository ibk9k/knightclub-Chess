import { ArrowRight, CircleHelp, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Square } from 'chess.js';

export function MoveRuleNotice({ message, from, to, onDismiss }: { message: string; from: Square; to?: Square; onDismiss: () => void }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => { notice.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [message, from, to]);
  return <div ref={notice} className="move-rule-notice" role="status" aria-live="polite" aria-atomic="true">
    <CircleHelp className="move-rule-icon" size={22} aria-hidden="true" />
    <div><div className="move-rule-heading"><strong>Why can’t I move there?</strong>{to && <span className="move-rule-attempt" aria-label={`Attempted move ${from} to ${to}`}>{from}<ArrowRight size={12} aria-hidden="true" />{to}</span>}</div><p id="move-rule-explanation">{message}</p></div>
    <button className="icon-button small" aria-label="Dismiss move explanation" onClick={onDismiss}><X size={17} /></button>
  </div>;
}
