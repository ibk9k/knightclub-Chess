DROP INDEX `one_waiting_match_per_clock`;--> statement-breakpoint
ALTER TABLE `chess_rooms` ADD `cheat_mode` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `one_waiting_match_per_clock` ON `chess_rooms` (`time_control`,`cheat_mode`) WHERE "chess_rooms"."status" = 'waiting' AND "chess_rooms"."visibility" = 'public';