import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Square } from 'chess.js';

interface DragPiece { from: Square; image: string; size: number; x: number; y: number; over: Square | null }
interface DragStart extends DragPiece { pointerId: number; startX: number; startY: number; active: boolean; board: HTMLElement }

export function usePieceDrag({ positionKey, onSelect, onDrop }: { positionKey: string; onSelect: (square: Square) => void; onDrop: (from: Square, to: Square) => void }) {
  const [piece, setPiece] = useState<DragPiece | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const started = useRef<DragStart | null>(null), suppressClick = useRef(false);
  const callbacks = useRef({ onSelect, onDrop }); callbacks.current = { onSelect, onDrop };
  const cancel = () => {
    const drag = started.current; started.current = null; setPiece(null);
    if (drag?.board.hasPointerCapture(drag.pointerId)) drag.board.releasePointerCapture(drag.pointerId);
  };
  useEffect(() => { cancel(); }, [positionKey]);
  useEffect(() => {
    const targetAt = (x: number, y: number, board: HTMLElement): Square | null => {
      const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-square]');
      return element && board.contains(element) ? element.dataset.square as Square : null;
    };
    const move = (event: PointerEvent) => {
      const drag = started.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
      event.preventDefault();
      if (!drag.active) { drag.active = true; drag.board.setPointerCapture(event.pointerId); callbacks.current.onSelect(drag.from); }
      drag.x = event.clientX; drag.y = event.clientY; drag.over = targetAt(event.clientX, event.clientY, drag.board);
      if (imageRef.current) { imageRef.current.style.left = `${drag.x}px`; imageRef.current.style.top = `${drag.y}px`; }
      setPiece(previous => previous?.over === drag.over ? previous : { from: drag.from, image: drag.image, size: drag.size, x: drag.x, y: drag.y, over: drag.over });
    };
    const end = (event: PointerEvent) => {
      const drag = started.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const to = targetAt(event.clientX, event.clientY, drag.board);
      cancel();
      if (!drag.active) return;
      event.preventDefault(); suppressClick.current = true;
      // Suppress only the click synthesized from this release, not the next
      // intentional tap when a drag was released outside the board.
      setTimeout(() => { suppressClick.current = false; }, 0);
      if (to && to !== drag.from) callbacks.current.onDrop(drag.from, to);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end, { capture: true });
    window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end, { capture: true });
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key);
    };
  }, []);
  const start = (event: ReactPointerEvent<HTMLButtonElement>, from: Square, image: string) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const board = event.currentTarget.closest<HTMLElement>('.board');
    if (!board) return;
    const size = event.currentTarget.getBoundingClientRect().width * .88;
    started.current = { from, image, size, x: event.clientX, y: event.clientY, over: from, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, board };
  };
  return { piece, imageRef, start, cancel, suppressClick };
}
