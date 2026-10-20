ALTER TABLE `chess_rooms` ADD `rematch_offer` text;--> statement-breakpoint
ALTER TABLE `chess_rooms` ADD `round` integer DEFAULT 1 NOT NULL;