CREATE TABLE `plan_agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	`window_started_at` integer,
	`window_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_agent_tokens_hash_uq` ON `plan_agent_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `plan_agent_tokens_plan_idx` ON `plan_agent_tokens` (`plan_id`);--> statement-breakpoint
CREATE TABLE `task_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`author` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`token_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`token_id`) REFERENCES `plan_agent_tokens`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_notes_task_idx` ON `task_notes` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_notes_plan_idx` ON `task_notes` (`plan_id`);--> statement-breakpoint
ALTER TABLE `plans` ADD `agent_instructions` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `agent_token_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `claimed_at` integer;--> statement-breakpoint
CREATE INDEX `tasks_agent_token_idx` ON `tasks` (`agent_token_id`,`status`);