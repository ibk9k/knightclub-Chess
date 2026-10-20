CREATE TABLE `chess_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	`status` text NOT NULL,
	`white_key` text,
	`black_key` text,
	`white_name` text NOT NULL,
	`black_name` text NOT NULL,
	`moves` text NOT NULL,
	`fen` text NOT NULL,
	`version` integer NOT NULL,
	`time_control` integer NOT NULL,
	`white_ms` integer NOT NULL,
	`black_ms` integer NOT NULL,
	`turn_started_at` integer,
	`white_seen` integer NOT NULL,
	`black_seen` integer NOT NULL,
	`draw_offer` text,
	`outcome` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chess_queue` ON `chess_rooms` (`status`,`visibility`,`time_control`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_waiting_match_per_clock` ON `chess_rooms` (`time_control`) WHERE "chess_rooms"."status" = 'waiting' AND "chess_rooms"."visibility" = 'public';