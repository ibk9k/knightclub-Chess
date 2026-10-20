// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const chessRooms = sqliteTable('chess_rooms', {
  code: text('code').primaryKey(),
  visibility: text('visibility').notNull(),
  status: text('status').notNull(),
  whiteKey: text('white_key'),
  blackKey: text('black_key'),
  whiteName: text('white_name').notNull(),
  blackName: text('black_name').notNull(),
  moves: text('moves').notNull(),
  fen: text('fen').notNull(),
  version: integer('version').notNull(),
  timeControl: integer('time_control').notNull(),
  whiteMs: integer('white_ms').notNull(),
  blackMs: integer('black_ms').notNull(),
  turnStartedAt: integer('turn_started_at'),
  whiteSeen: integer('white_seen').notNull(),
  blackSeen: integer('black_seen').notNull(),
  drawOffer: text('draw_offer'),
  outcome: text('outcome'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  index('chess_queue').on(table.status, table.visibility, table.timeControl, table.createdAt),
  uniqueIndex('one_waiting_match_per_clock').on(table.timeControl).where(sql`${table.status} = 'waiting' AND ${table.visibility} = 'public'`),
]);
