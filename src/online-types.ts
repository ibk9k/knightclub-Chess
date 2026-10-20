import type { Color } from 'chess.js';

export interface OnlineRoom {
  code: string;
  visibility: 'private' | 'public';
  status: 'waiting' | 'active' | 'finished' | 'cancelled';
  seat: Color;
  players: { w: string; b: string };
  connected: { w: boolean; b: boolean };
  moves: string[];
  fen: string;
  version: number;
  timeControl: number;
  clocks: { w: number; b: number };
  clockRunning: boolean;
  serverNow: number;
  drawOffer: Color | null;
  outcome: string | null;
  rematchOffer: Color | null;
  round: number;
}
export type OnlineAction = 'resign' | 'cancel' | 'offer-draw' | 'accept-draw' | 'decline-draw' | 'request-rematch' | 'accept-rematch' | 'decline-rematch';
