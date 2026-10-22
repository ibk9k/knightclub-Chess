DROP INDEX `one_waiting_match_per_clock`;--> statement-breakpoint
ALTER TABLE `chess_rooms` ADD `direct_takebacks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chess_rooms` ADD `takeback_offer` text;--> statement-breakpoint
CREATE UNIQUE INDEX `one_waiting_match_per_clock` ON `chess_rooms` (`time_control`,`cheat_mode`,`direct_takebacks`) WHERE "chess_rooms"."status" = 'waiting' AND "chess_rooms"."visibility" = 'public';