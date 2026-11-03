CREATE TABLE `affinity` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instruction_revisions` (
	`character_id` text NOT NULL,
	`revision` integer NOT NULL,
	`instructions` text NOT NULL,
	`created_at` real NOT NULL,
	PRIMARY KEY(`character_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`seq` integer NOT NULL,
	`at` real NOT NULL,
	`role` text NOT NULL,
	`message` text NOT NULL,
	`chat` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_character_id_seq_unique` ON `messages` (`character_id`,`seq`);--> statement-breakpoint
CREATE TABLE `note_revisions` (
	`character_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`created_at` real NOT NULL,
	PRIMARY KEY(`character_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`character_id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`started_at` real NOT NULL,
	`finished_at` real,
	`status` text NOT NULL,
	`reply` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `routine_runs_routine` ON `routine_runs` (`routine_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `routines` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`at` real NOT NULL,
	`until_id` text NOT NULL,
	`text` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `summaries_character` ON `summaries` (`character_id`,`at`);--> statement-breakpoint
CREATE TABLE `voice_files` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_refs` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
