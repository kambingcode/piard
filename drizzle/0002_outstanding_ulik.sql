CREATE TABLE `agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`codebase_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`codebase_id`) REFERENCES `codebases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_hash_uq` ON `agent_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_tokens_codebase_idx` ON `agent_tokens` (`codebase_id`);--> statement-breakpoint
CREATE TABLE `codebase_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`codebase_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`codebase_id`) REFERENCES `codebases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `codebase_docs_codebase_slug_version_uq` ON `codebase_docs` (`codebase_id`,`slug`,`version`);--> statement-breakpoint
CREATE TABLE `codebases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`language` text DEFAULT 'id' NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`status` text DEFAULT 'awaiting_source' NOT NULL,
	`error` text,
	`detected_stack` text DEFAULT '{"languages":[],"tools":[]}' NOT NULL,
	`manifest` text,
	`source_received_at` integer,
	`analyzed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `codebases_user_updated_idx` ON `codebases` (`user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `plans` ADD `codebase_id` text REFERENCES codebases(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `plans_codebase_idx` ON `plans` (`codebase_id`);